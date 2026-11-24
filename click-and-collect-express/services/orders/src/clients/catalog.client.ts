// =====================================================================
//  Client HTTP du catalog-service — réservation / libération de stock
//
//  SOURCE DE VÉRITÉ DES PRIX : la réponse de /products/reserve fait foi
//  pour le calcul du total — les prix envoyés par le client ne sont jamais
//  utilisés (expectedPrice sert uniquement à détecter une divergence).
//
//  NB : reserve et release ne sont PAS idempotents → AUCUN retry
//  automatique (un timeout après succès côté catalog réserverait deux
//  fois le stock). En production : identifiants de réservation + TTL.
// =====================================================================
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { AppError, ConflictError, NotFoundError } from '../lib/errors.js';

export interface CatalogReserveItem {
  productId: string;
  quantity: number;
  expectedPrice?: number;
}

export interface CatalogReserveResultItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number; // centimes — autoritaire
  subtotal: number; // centimes
  remainingStock: number;
}

export interface CatalogReserveResult {
  items: CatalogReserveResultItem[];
  reservedAt: string;
}

export interface CatalogReleaseItem {
  productId: string;
  quantity: number;
}

interface CatalogErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown };
}

class CatalogClient {
  /** POST /products/reserve — atomique (stock) + vérification des prix. */
  async reserveItems(items: CatalogReserveItem[]): Promise<CatalogReserveResult> {
    return this.request<CatalogReserveResult>('POST', '/products/reserve', { items });
  }

  /** POST /products/release — compensation (annulation / échec de paiement). */
  async releaseItems(items: CatalogReleaseItem[]): Promise<void> {
    await this.request<unknown>('POST', '/products/release', { items });
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${config.catalogUrl}${path}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(config.catalogTimeoutMs),
      });
    } catch (err) {
      logger.error({ err, url }, 'catalog-service injoignable');
      throw new AppError(502, 'CATALOG_UNAVAILABLE', 'Service catalogue indisponible');
    }

    const json = (await response
      .json()
      .catch(() => null)) as (CatalogErrorEnvelope & Record<string, unknown>) | null;

    if (response.ok) {
      if (json && typeof json === 'object' && 'data' in json && (json as { data: unknown }).data !== undefined) {
        return (json as { data: T }).data;
      }
      return json as T;
    }

    const message = json?.error?.message ?? `catalog-service a répondu ${response.status}`;
    const details = json?.error?.details;

    switch (response.status) {
      case 400:
        throw new AppError(400, 'INVALID_ORDER_ITEMS', message, details);
      case 404:
        throw new NotFoundError(message, details);
      case 409:
        throw new ConflictError(message, details);
      case 503:
        throw new AppError(503, 'CATALOG_UNAVAILABLE', message, details);
      default:
        throw new AppError(502, 'CATALOG_UPSTREAM_ERROR', message, details);
    }
  }
}

export const catalogClient = new CatalogClient();
