// =====================================================================
//  Consommateur des événements paiement
//  Traduit payment.succeeded / payment.failed en transitions de la
//  machine à états de la commande (voir services/order.service.ts).
// =====================================================================
import { logger } from '../../lib/logger.js';
import { orderService } from '../../services/order.service.js';
import { PAYMENT_EVENTS, paymentEventPayloadSchema } from '../../types/order.types.js';

export const paymentEventConsumer = {
  async onPaymentSucceeded(payload: unknown): Promise<void> {
    const parsed = paymentEventPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      // Payload malformé : un retry ne le corrigera pas → log + acquittement
      // (pas de dead-letter, la file ne s'encombre pas de messages pourris).
      logger.warn(
        { issues: parsed.error.issues, event: PAYMENT_EVENTS.SUCCEEDED },
        'payment.succeeded malformé — ignoré',
      );
      return;
    }
    await orderService.applyPaymentSucceeded(parsed.data);
  },

  async onPaymentFailed(payload: unknown): Promise<void> {
    const parsed = paymentEventPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      logger.warn(
        { issues: parsed.error.issues, event: PAYMENT_EVENTS.FAILED },
        'payment.failed malformé — ignoré',
      );
      return;
    }
    await orderService.applyPaymentFailed(parsed.data);
  },
};
