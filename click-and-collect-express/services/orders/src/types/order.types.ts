// =====================================================================
//  Contrats d'entrée/sortie du order-service — validation zod + événements
// =====================================================================
import { z } from 'zod';

// ── Statuts de commande ──────────────────────────────────────────────────────
export const ORDER_STATUSES = ['PENDING', 'PAID', 'PREPARING', 'READY', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Snapshot immuable d'un article au moment de la commande (stocké en JSON). */
export interface OrderItemSnapshot {
  productId: string;
  name: string;
  /** Prix unitaire au moment de la commande (centimes) — jamais recalculé. */
  unitPrice: number;
  quantity: number;
  subtotal: number; // unitPrice * quantity
}

// ── Événements publiés sur l'exchange topic `cnc.orders.events` ──────────────
export const ORDER_EVENTS = {
  ORDER_CREATED: 'order.created',
  ORDER_STATUS_UPDATED: 'order.status_updated',
} as const;

export type OrderEventType = (typeof ORDER_EVENTS)[keyof typeof ORDER_EVENTS];

/** Enveloppe standard de tous les événements du monorepo. */
export interface OrdersEventEnvelope<T = unknown> {
  eventId: string;
  eventType: OrderEventType | string;
  serviceName: 'order-service';
  occurredAt: string; // ISO 8601
  payload: T;
}

export interface OrderCreatedPayload {
  orderId: string;
  customerName: string;
  items: OrderItemSnapshot[];
  totalAmount: number; // centimes
  createdAt: string;
}

export interface OrderStatusUpdatedPayload {
  orderId: string;
  customerName: string;
  previousStatus: OrderStatus;
  status: OrderStatus;
  totalAmount: number;
  reason: 'payment_succeeded' | 'payment_failed' | 'kitchen_update';
  paymentId?: string;
  occurredAt: string;
}

// ── Événements consommés depuis l'exchange `cnc.payments.events` ─────────────
export const PAYMENT_EVENTS = {
  SUCCEEDED: 'payment.succeeded',
  FAILED: 'payment.failed',
} as const;

export const paymentEventPayloadSchema = z.object({
  orderId: z.string().min(1, 'orderId requis'),
  paymentId: z.string().optional(),
  amount: z.number().int().positive().optional(), // centimes
  reason: z.string().max(500).optional(),
});
export type PaymentEventData = z.infer<typeof paymentEventPayloadSchema>;

// ── DTO : création de commande (POST /orders) ────────────────────────────────
export const createOrderItemSchema = z.object({
  productId: z.string().min(1, 'productId requis'),
  quantity: z.number().int().min(1, 'La quantité minimale est 1').max(999),
  // Prix (centimes) affiché au client — transmis au catalog-service pour
  // vérification (409 price_mismatch si divergence). Le prix du catalogue
  // reste toujours la source de vérité pour le calcul du total.
  expectedPrice: z.number().int().positive().optional(),
});
export type CreateOrderItem = z.infer<typeof createOrderItemSchema>;

export const createOrderSchema = z.object({
  customerName: z.string().trim().min(1, 'Le nom du client est requis').max(100),
  items: z
    .array(createOrderItemSchema)
    .min(1, 'Une commande doit contenir au moins un article')
    .max(50, '50 articles maximum par commande'),
});
export type CreateOrderDto = z.infer<typeof createOrderSchema>;

// ── DTO : transition cuisine (PATCH /orders/:id/status) ──────────────────────
export const kitchenStatusSchema = z.object({
  status: z.enum(['PREPARING', 'READY']),
});

// ── DTO : filtres de liste (GET /orders) ─────────────────────────────────────
export const listOrdersQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
});

/** Parse défensif du champ JSON `items` lu depuis PostgreSQL. */
export function parseOrderItems(items: unknown): OrderItemSnapshot[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((entry) => {
    const record = entry as Record<string, unknown> | null;
    if (
      typeof record === 'object' &&
      record !== null &&
      typeof record.productId === 'string' &&
      typeof record.name === 'string' &&
      typeof record.unitPrice === 'number' &&
      typeof record.quantity === 'number' &&
      typeof record.subtotal === 'number'
    ) {
      return [record as unknown as OrderItemSnapshot];
    }
    return [];
  });
}
