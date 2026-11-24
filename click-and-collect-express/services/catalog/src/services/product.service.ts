// =====================================================================
//  Couche métier du catalog-service
//  Le cœur du service : la réservation atomique de stock.
// =====================================================================
import { Prisma, type Product } from '../generated/prisma/index.js';
import { prisma } from '../lib/prisma.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { catalogEvents } from '../events/publisher.js';
import type {
  AvailabilityChangedPayload,
  CreateProductDto,
  ListProductsQuery,
  ReleaseResult,
  ReserveItem,
  ReserveResult,
  StockConflictDetail,
} from '../types/product.types.js';

export const productService = {
  /** Liste filtrable — produits disponibles uniquement par défaut. */
  async listProducts(query: ListProductsQuery): Promise<{ items: Product[]; total: number }> {
    const where: Prisma.ProductWhereInput = {
      ...(query.includeUnavailable ? {} : { isAvailable: true }),
      ...(query.category ? { category: query.category } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    // findMany + count dans une seule transaction = réponse cohérente.
    const [items, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      }),
      prisma.product.count({ where }),
    ]);

    return { items, total };
  },

  async getProduct(productId: string): Promise<Product> {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundError(`Produit introuvable : ${productId}`);
    }
    return product;
  },

  async createProduct(dto: CreateProductDto): Promise<Product> {
    const existing = await prisma.product.findUnique({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictError(`Un produit nommé "${dto.name}" existe déjà`);
    }

    const product = await prisma.product.create({ data: { ...dto } });

    catalogEvents.productCreated({
      productId: product.id,
      name: product.name,
      price: product.price,
      category: product.category,
      stock: product.stock,
      isAvailable: product.isAvailable,
    });

    return product;
  },

  /**
   * Réservation atomique de stock + vérification des prix — appelée par
   * order-service au passage de commande.
   *
   * 1. Fusionne les doublons du panier : [{A,1},{A,2}] → A:3.
   * 2. Valide existence + disponibilité + stock + prix attendu (messages précis).
   * 3. Décrémente via un UPDATE CONDITIONNEL (`WHERE stock >= quantité`) :
   *    sous course concurrente, l'update ne matche aucune ligne (P2025),
   *    la transaction entière est annulée → 409 au client.
   *    Garantie : jamais de stock négatif, jamais de sur-vente.
   */
  async reserveStock(items: ReserveItem[]): Promise<ReserveResult> {
    const requested = mergeQuantities(items);
    const productIds = [...requested.keys()];

    const reserved = await prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({ where: { id: { in: productIds } } });
      const byId = new Map(products.map((p) => [p.id, p] as const));

      const missing = productIds.filter((id) => !byId.has(id));
      if (missing.length > 0) {
        throw new NotFoundError('Produit(s) introuvable(s)', { productIds: missing });
      }

      const conflicts: StockConflictDetail[] = [];
      for (const [id, entry] of requested) {
        const product = byId.get(id)!;
        if (!product.isAvailable) {
          conflicts.push({
            productId: id,
            name: product.name,
            requested: entry.quantity,
            available: 0,
            reason: 'unavailable',
          });
        } else if (product.stock < entry.quantity) {
          conflicts.push({
            productId: id,
            name: product.name,
            requested: entry.quantity,
            available: product.stock,
            reason: 'insufficient_stock',
          });
        } else if (
          entry.expectedPrice !== undefined &&
          entry.expectedPrice !== product.price
        ) {
          // Vérification des prix : impossible de commander à un prix différent
          // de celui du catalogue (source de vérité).
          conflicts.push({
            productId: id,
            name: product.name,
            requested: entry.quantity,
            available: product.stock,
            reason: 'price_mismatch',
            expectedPrice: entry.expectedPrice,
            currentPrice: product.price,
          });
        }
      }
      if (conflicts.length > 0) {
        throw new ConflictError('Stock insuffisant ou prix divergent pour au moins un article', {
          items: conflicts,
        });
      }

      const updated: Product[] = [];
      for (const [id, entry] of requested) {
        // Update conditionnel : la garantie d'atomicité face aux requêtes concurrentes.
        // Si le stock a changé entre la lecture et l'écriture → P2025 → rollback global.
        const product = await tx.product.update({
          where: { id, stock: { gte: entry.quantity } },
          data: { stock: { decrement: entry.quantity } },
        });
        updated.push(product);
      }
      return updated;
    });

    // Hors transaction : publication best-effort des changements de disponibilité.
    for (const product of reserved) {
      catalogEvents.availabilityChanged(toAvailabilityPayload(product, 'reserve'));
    }

    return {
      // Le catalogue fait foi sur les PRIX : unitPrice + subtotal autoritaires.
      items: reserved.map((p) => {
        const entry = requested.get(p.id)!;
        return {
          productId: p.id,
          name: p.name,
          quantity: entry.quantity,
          unitPrice: p.price,
          subtotal: p.price * entry.quantity,
          remainingStock: p.stock,
        };
      }),
      reservedAt: new Date().toISOString(),
    };
  },

  /**
   * Libération de stock (compensation du pattern saga) :
   * annulation client ou échec de paiement → ré-incrément du stock.
   * Best-effort : un produit supprimé entre-temps est signalé, pas bloquant.
   */
  async releaseStock(items: ReserveItem[]): Promise<ReleaseResult> {
    const requested = mergeQuantities(items);
    const productIds = [...requested.keys()];

    const released = await prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({ where: { id: { in: productIds } } });
      const byId = new Map(products.map((p) => [p.id, p] as const));

      const updated: Product[] = [];
      for (const [id, entry] of requested) {
        const product = byId.get(id);
        if (!product) continue; // signalé dans `skipped`, sans faire échouer la compensation
        updated.push(
          await tx.product.update({ where: { id }, data: { stock: { increment: entry.quantity } } }),
        );
      }
      return { updated, missing: productIds.filter((id) => !byId.has(id)) };
    });

    for (const product of released.updated) {
      catalogEvents.availabilityChanged(toAvailabilityPayload(product, 'release'));
    }

    return {
      items: released.updated.map((p) => {
        const entry = requested.get(p.id)!;
        return {
          productId: p.id,
          name: p.name,
          quantity: entry.quantity,
          unitPrice: p.price,
          subtotal: p.price * entry.quantity,
          remainingStock: p.stock,
        };
      }),
      skipped: released.missing.map((id) => ({ productId: id, reason: 'not_found' as const })),
      releasedAt: new Date().toISOString(),
    };
  },
};

// ── Helpers internes ─────────────────────────────────────────────────────────

/**
 * Fusionne les doublons d'une liste d'articles : [{A,1},{A,2}] → A:3.
 * Prix attendus divergents pour un même produit → on conserve le premier
 * (le catalogue reste la source de vérité de toute façon).
 */
function mergeQuantities(
  items: ReserveItem[],
): Map<string, { quantity: number; expectedPrice?: number }> {
  const merged = new Map<string, { quantity: number; expectedPrice?: number }>();
  for (const item of items) {
    const existing = merged.get(item.productId);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      merged.set(item.productId, { quantity: item.quantity, expectedPrice: item.expectedPrice });
    }
  }
  return merged;
}

function toAvailabilityPayload(
  product: Product,
  source: AvailabilityChangedPayload['source'],
): AvailabilityChangedPayload {
  return {
    productId: product.id,
    name: product.name,
    stock: product.stock,
    isAvailable: product.isAvailable,
    source,
  };
}
