// =====================================================================
//  Consommateur order.created :
//    validation zod → idempotence → traitement (2 s) → publication
//    payment.succeeded / payment.failed avec publisher confirms.
// =====================================================================
import { logger } from '../../lib/logger.js';
import { paymentBroker } from '../broker.js';
import { paymentProcessor } from '../../services/payment-processor.js';
import { paymentStore } from '../../services/payment-store.js';
import {
  PAYMENT_EVENTS,
  orderCreatedPayloadSchema,
  toPaymentEventPayload,
  type PaymentRecord,
} from '../../types/payment.types.js';

/**
 * Publie le résultat du paiement sur `cnc.payments.events`.
 * Publisher confirms : si le broker n'acquitte pas → exception → le
 * message order.created repart en DLQ pour rejeu (l'idempotence du
 * store garantit qu'aucun client ne sera débité deux fois).
 */
async function publishPaymentResult(record: PaymentRecord): Promise<void> {
  const eventType =
    record.outcome === 'SUCCEEDED' ? PAYMENT_EVENTS.SUCCEEDED : PAYMENT_EVENTS.FAILED;
  await paymentBroker.publishConfirmed(eventType, toPaymentEventPayload(record));
}

export const orderCreatedConsumer = {
  async onOrderCreated(payload: unknown): Promise<void> {
    const parsed = orderCreatedPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      // Payload malformé : un retry ne le corrigera pas → log + acquittement
      // (pas de dead-letter, la file ne s'encombre pas de messages pourris).
      logger.warn({ issues: parsed.error.issues }, 'order.created malformé — ignoré');
      return;
    }
    const order = parsed.data;

    // Idempotence : une redelivery du même order.created ne doit pas
    // re-débiter le client. On re-publie simplement le résultat existant
    // (order-service ignore les doublons grâce à sa machine à états).
    const existing = paymentStore.getByOrderId(order.orderId);
    if (existing) {
      logger.info(
        {
          orderId: order.orderId,
          paymentId: existing.paymentId,
          outcome: existing.outcome,
        },
        'order.created en double — re-publication du résultat existant (idempotence)',
      );
      await publishPaymentResult(existing);
      return;
    }

    const record = await paymentProcessor.processOrderCreated(order);
    await publishPaymentResult(record);
  },
};
