// =====================================================================
//  @cnc/shared — Contrats d'événements RabbitMQ (registre canonique)
//
//  Enveloppe standard de tous les événements du monorepo :
//    { eventId, eventType, serviceName, occurredAt, payload }
//  Routing key = eventType (ex : "order.created").
//
//  Exchange topic par domaine :
//    - cnc.orders.events    : order.created, order.status_updated
//    - cnc.payments.events  : payment.succeeded, payment.failed
//    - cnc.catalog.events   : catalog.product.created, catalog.availability.changed
//
//  REMARQUE : chaque service déclare aujourd'hui une copie locale
//  compatible de ces contrats (build Docker indépendant par service).
//  Ce paquet fait foi pour toute évolution des schémas.
// =====================================================================

// ── Enveloppe standard ───────────────────────────────────────────────────────

export interface EventEnvelope<T = unknown> {
  /** UUID v4 — identifiant unique du message (propriété AMQP messageId). */
  eventId: string;
  /** Type d'événement = routing key (ex : 'order.created'). */
  eventType: string;
  /** Service émetteur (ex : 'order-service', 'payment-service'). */
  serviceName: string;
  /** Horodatage ISO 8601 de l'émission. */
  occurredAt: string;
  /** Charge utile typée par événement. */
  payload: T;
}

// ── Noms d'événements (routing keys) ─────────────────────────────────────────

export const ORDER_EVENTS = {
  /** Publié par order-service après réservation de stock + création en base. */
  ORDER_CREATED: 'order.created',
  /** Publié par order-service à chaque transition de statut (saga / cuisine). */
  ORDER_STATUS_UPDATED: 'order.status_updated',
} as const;

export const PAYMENT_EVENTS = {
  /** Publié par payment-service après un traitement réussi. */
  SUCCEEDED: 'payment.succeeded',
  /** Publié par payment-service après un refus (aléatoire ou forcé). */
  FAILED: 'payment.failed',
} as const;

export type OrderEventType =
  | (typeof ORDER_EVENTS)[keyof typeof ORDER_EVENTS];

export type PaymentEventType =
  | (typeof PAYMENT_EVENTS)[keyof typeof PAYMENT_EVENTS];

// ── Statuts de commande ──────────────────────────────────────────────────────

export const ORDER_STATUSES = [
  'PENDING',
  'PAID',
  'PREPARING',
  'READY',
  'CANCELLED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

// ── Payloads ─────────────────────────────────────────────────────────────────

/** Snapshot immuable d'un article au moment de la commande (prix en centimes). */
export interface OrderItemSnapshot {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

/** order.created — déclenche le paiement (consommé par payment-service). */
export interface OrderCreatedPayload {
  orderId: string;
  customerName: string;
  items: OrderItemSnapshot[];
  /** Montant total en centimes — source de vérité : prix du catalogue. */
  totalAmount: number;
  createdAt: string;
  /**
   * Paramètre de TEST (optionnel, ignoré en production par order-service) :
   * force l'issue du paiement au lieu du tirage aléatoire 90 % / 10 %.
   */
  forceOutcome?: 'success' | 'failure';
}

/** payment.succeeded / payment.failed — consommés par order-service. */
export interface PaymentResultPayload {
  orderId: string;
  paymentId: string;
  /** Montant encaissé (centimes) — égal à order.created.totalAmount. */
  amount: number;
  /** Motif lisible (ex : 'card_declined (simulation)') — absent si succès. */
  reason?: string;
  /** Provider utilisé ('mock' aujourd'hui). */
  provider: string;
  processedAt: string;
}

/** order.status_updated — consommé par notification-service (Socket.io). */
export interface OrderStatusUpdatedPayload {
  orderId: string;
  customerName: string;
  previousStatus: OrderStatus | string;
  status: OrderStatus | string;
  totalAmount: number;
  reason: string;
  paymentId?: string;
  occurredAt: string;
}
