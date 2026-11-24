// =====================================================================
//  Processeur de paiement — simulation purement locale.
//
//    1. délai de "traitement bancaire" (PAYMENT_PROCESSING_MS, 2 s par défaut)
//    2. issue du paiement :
//         - forceOutcome présent dans order.created (paramètre de test)
//           → 'success' | 'failure' forcé,
//         - sinon tirage aléatoire : succès dans PAYMENT_SUCCESS_RATE
//           des cas (0.9 par défaut ⇒ 90 % succès / 10 % échec).
//    3. enregistrement du résultat en mémoire + logs structurés.
//
//  La publication payment.succeeded / payment.failed est faite par le
//  consommateur (order.consumer.ts) avec publisher confirms.
// =====================================================================
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { paymentStore } from './payment-store.js';
import type { OrderCreatedPayload, PaymentRecord } from '../types/payment.types.js';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Motifs d'échec simulés (tirés au hasard en cas de refus). */
const FAILURE_REASONS = [
  'card_declined',
  'insufficient_funds',
  'network_timeout',
  'issuer_unreachable',
] as const;

class PaymentProcessor {
  async processOrderCreated(order: OrderCreatedPayload): Promise<PaymentRecord> {
    const paymentId = `pay_${randomUUID()}`;
    const startedAt = new Date();

    logger.info(
      {
        paymentId,
        orderId: order.orderId,
        amount: order.totalAmount,
        forcedOutcome: order.forceOutcome ?? null,
      },
      'Traitement du paiement en cours...',
    );

    await sleep(config.processingTimeMs);

    const forced = order.forceOutcome !== undefined;
    const success = forced
      ? order.forceOutcome === 'success'
      : Math.random() < config.successRate;

    const completedAt = new Date();
    const record: PaymentRecord = {
      paymentId,
      orderId: order.orderId,
      outcome: success ? 'SUCCEEDED' : 'FAILED',
      amount: order.totalAmount,
      ...(success
        ? {}
        : {
            reason: `${FAILURE_REASONS[Math.floor(Math.random() * FAILURE_REASONS.length)]} (simulation)`,
          }),
      provider: config.provider,
      forced,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
    };

    paymentStore.save(record);

    logger.info(
      {
        paymentId,
        orderId: record.orderId,
        outcome: record.outcome,
        reason: record.reason ?? null,
        durationMs: record.durationMs,
        forced,
      },
      success ? 'Paiement accepté (SUCCEEDED)' : 'Paiement refusé (FAILED)',
    );

    return record;
  }
}

export const paymentProcessor = new PaymentProcessor();
