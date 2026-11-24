// =====================================================================
//  Contrats d'entrée/sortie du catalog-service — validation zod
// =====================================================================
import { z } from 'zod';

// ── Événements publiés sur l'exchange topic `cnc.catalog.events` ────────────
export const CATALOG_EVENTS = {
  PRODUCT_CREATED: 'catalog.product.created',
  PRODUCT_UPDATED: 'catalog.product.updated', // réservé au futur PATCH /products/:id
  PRODUCT_AVAILABILITY_CHANGED: 'catalog.product.availability_changed',
} as const;

export type CatalogEventType = (typeof CATALOG_EVENTS)[keyof typeof CATALOG_EVENTS];

/** Enveloppe standard de tous les événements du monorepo. */
export interface CatalogEvent<T> {
  eventId: string;
  eventType: CatalogEventType;
  serviceName: 'catalog-service';
  occurredAt: string; // ISO 8601
  payload: T;
}

export interface ProductCreatedPayload {
  productId: string;
  name: string;
  price: number; // centimes
  category: string;
  stock: number;
  isAvailable: boolean;
}

export interface AvailabilityChangedPayload {
  productId: string;
  name: string;
  stock: number;
  isAvailable: boolean;
  source: 'reserve' | 'release' | 'admin';
}

// ── DTO : création d'un produit (POST /products) ────────────────────────────
export const createProductSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est requis').max(120),
  description: z.string().trim().max(2000).optional(),
  price: z
    .number()
    .int('Le prix doit être un nombre entier de centimes')
    .positive('Le prix doit être strictement positif')
    .max(10_000_000, 'Prix unitaire maximal : 100 000,00 €'),
  category: z.string().trim().min(1, 'La catégorie est requise').max(50),
  stock: z.number().int().min(0).default(0),
  imageUrl: z.string().url('imageUrl doit être une URL valide').optional(),
  isAvailable: z.boolean().default(true),
});
export type CreateProductDto = z.infer<typeof createProductSchema>;

// ── DTO : réservation / libération de stock (appelé par order-service) ─────
export const reserveItemSchema = z.object({
  productId: z.string().min(1, 'productId requis'),
  quantity: z
    .number()
    .int()
    .min(1, 'La quantité minimale est 1')
    .max(999, 'La quantité maximale est 999'),
  // Prix (centimes) affiché au client — si fourni, vérifié par le catalogue :
  // 409 price_mismatch en cas de divergence. Optionnel pour rétrocompatibilité.
  expectedPrice: z.number().int().positive().optional(),
});
export type ReserveItem = z.infer<typeof reserveItemSchema>;

export const itemListSchema = z.object({
  items: z
    .array(reserveItemSchema)
    .min(1, "La liste d'articles ne peut pas être vide")
    .max(50, '50 articles maximum par requête'),
});
export type ItemListRequest = z.infer<typeof itemListSchema>;

// ── DTO : filtres de liste (GET /products) ──────────────────────────────────
const booleanQueryParam = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value === 'true');

export const listProductsQuerySchema = z.object({
  category: z.string().trim().min(1).max(50).optional(),
  search: z.string().trim().min(1).max(120).optional(),
  includeUnavailable: booleanQueryParam, // défaut : false → disponibles uniquement
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

// ── Sorties ─────────────────────────────────────────────────────────────────
export interface ReserveResultItem {
  productId: string;
  name: string;
  quantity: number;
  /** Prix unitaire autoritaire du catalogue (centimes) — fait foi pour le total. */
  unitPrice: number;
  /** unitPrice * quantity (centimes). */
  subtotal: number;
  remainingStock: number;
}

export interface ReserveResult {
  items: ReserveResultItem[];
  reservedAt: string;
}

export interface ReleaseSkippedItem {
  productId: string;
  reason: 'not_found';
}

export interface ReleaseResult {
  items: ReserveResultItem[];
  skipped: ReleaseSkippedItem[];
  releasedAt: string;
}

export interface StockConflictDetail {
  productId: string;
  name: string;
  requested: number;
  available: number;
  reason: 'insufficient_stock' | 'unavailable' | 'price_mismatch';
  expectedPrice?: number;
  currentPrice?: number;
}
