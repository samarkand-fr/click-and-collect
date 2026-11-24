// =====================================================================
//  Contrats du payment-service — validation zod + événements publiés.
//  Copies compatibles du registre canonique @cnc/shared :
//   - consomme  : order.created   (exchange `cnc.orders.events`)
//   - publie    : payment.succeeded / payment.failed
//                 (exchange `cnc.payments.events`)
// =====================================================================
import { z } from 'zod';

// ── Événement consommé ───────────────────────────────────────────────────────
export const ORDER_EVENTS = {
  ORDER_CREATED: 'order.created',
} as const;

// ── Événements publiés ───────────────────────────────────────────────────────
export const PAYMENT_EVENTS = {
  SUCCEEDED: 'payment.succeeded',
  FAILED: 'payment.failed',
} as const;

export type PaymentEventType =
  | (typeof PAYMENT_EVENTS)[keyof typeof PAYMENT_EVENTS];

/** Enveloppe standard de tous les événements du monorepo. */
export interface EventEnvelope<T = unknown> {
  eventId: string;
  eventType: string;
  serviceName: string;
  occurredAt: string;
  payload: T;
}

/** Snapshot immuable d'un article (payload order.created, prix en centimes). */
export const orderItemSnapshotSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1),
  unitPrice: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  subtotal: z.number().int().nonnegative(),
});

/**
 * Payload `order.created` publié par order-service.
 * `forceOutcome` est un paramètre de TEST optionnel (ignoré par
 * order-service) : il force l'issue du paiement au lieu du tirage
 * aléatoire 90 % / 10 %.
 */
export const orderCreatedPayloadSchema = z.object({
  orderId: z.string().min(1, 'orderId requis'),
  customerName: z.string().min(1),
  items: z.array(orderItemSnapshotSchema).min(1),
  totalAmount: z.number().int().positive('totalAmount doit être un entier positif (centimes)'),
  createdAt: z.string().min(1),
  forceOutcome: z.enum(['success', 'failure']).optional(),
});
export type OrderItemSnapshot = z.infer<typeof orderItemSnapshotSchema>;
export type OrderCreatedPayload = z.infer<typeof orderCreatedPayloadSchema>;

// ── Résultat d'un traitement de paiement (mémoire du process) ────────────────
export type PaymentOutcome = 'SUCCEEDED' | 'FAILED';

export interface PaymentRecord {
  paymentId: string;
  orderId: string;
  outcome: PaymentOutcome;
  /** Montant encaissé ou refusé, en centimes. */
  amount: number;
  /** Motif en cas d'échec (ex : 'card_declined (simulation)'). */
  reason?: string;
  provider: string;
  /** true si l'issue a été forcée via forceOutcome (paramètre de test). */
  forced: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

/**
 * Payload publié sur `cnc.payments.events` — compatible avec le schéma zod
 * consommé par order-service (paymentEventPayloadSchema :
 * { orderId, paymentId?, amount?, reason? }) + champs d'information
 * additionnels tolérés (provider, processedAt).
 */
export function toPaymentEventPayload(record: PaymentRecord): {
  orderId: string;
  paymentId: string;
  amount: number;
  reason?: string;
  provider: string;
  processedAt: string;
} {
  return {
    orderId: record.orderId,
    paymentId: record.paymentId,
    amount: record.amount,
    ...(record.reason ? { reason: record.reason } : {}),
    provider: record.provider,
    processedAt: record.completedAt,
  };
}
