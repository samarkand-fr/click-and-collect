// =====================================================================
//  Service de notification — pipeline d'une mise à jour de statut :
//    validation zod → historique mémoire (écrans qui se re-connectent)
//    → diffusion Socket.io sur les deux rooms.
//  C'est le même pipeline pour un événement RabbitMQ réel et pour un
//  événement injecté via POST /__test/status-update.
// =====================================================================
import { logger } from '../lib/logger.js';
import { realtimeHub } from '../realtime/socket-server.js';
import {
  catalogProductEventPayloadSchema,
  orderStatusUpdatedPayloadSchema,
  type CatalogProductEventPayload,
  type OrderStatusUpdatedPayload,
} from '../types/notification.types.js';

export interface StoredStatusEvent {
  receivedAt: string;
  payload: OrderStatusUpdatedPayload;
}

/** Historique mémoire (écrans qui rafraîchissent leur page). */
const MAX_RECENT = 100;

class NotificationService {
  private recent: StoredStatusEvent[] = [];

  /** Callback du broker : une entrée par message `order.status_updated`. */
  async onOrderStatusUpdated(raw: unknown): Promise<void> {
    const parsed = orderStatusUpdatedPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      // Payload malformé : un retry ne le corrigera pas → log + acquittement
      // (géré par le broker) — pas de boucle de redelivery.
      logger.warn(
        { issues: parsed.error.issues },
        'order.status_updated malformé — ignoré',
      );
      return;
    }
    const payload = parsed.data;

    logger.info(
      {
        orderId: payload.orderId,
        previousStatus: payload.previousStatus,
        status: payload.status,
        reason: payload.reason,
      },
      'order.status_updated consommé',
    );

    this.remember(payload);
    realtimeHub.broadcastStatusUpdate(payload);
  }

  /**
   * Callback du broker : un message `catalog.product.*` (stock en direct).
   * Diffusé à TOUS les clients Socket.io (la carte est commune aux écrans
   * client et cuisine) — pas de room : la donnée est publique et faible.
   */
  async onCatalogProductEvent(raw: unknown): Promise<void> {
    const parsed = catalogProductEventPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn(
        { issues: parsed.error.issues },
        'Événement catalog.product.* malformé — ignoré',
      );
      return;
    }
    const payload: CatalogProductEventPayload = parsed.data;

    logger.debug(
      { productId: payload.productId, stock: payload.stock, source: payload.source },
      'catalog.product.* consommé — diffusion du stock en direct',
    );

    realtimeHub.broadcastCatalogUpdate(payload);
  }

  private remember(payload: OrderStatusUpdatedPayload): void {
    this.recent.push({ receivedAt: new Date().toISOString(), payload });
    if (this.recent.length > MAX_RECENT) {
      this.recent.shift();
    }
  }

  /** Historique, les plus récents d'abord ; filtre optionnel par commande. */
  recentEvents(orderId?: string): StoredStatusEvent[] {
    return this.recent
      .filter((event) => (orderId ? event.payload.orderId === orderId : true))
      .reverse();
  }

  get stats(): { storedEvents: number } {
    return { storedEvents: this.recent.length };
  }
}

export const notificationService = new NotificationService();
