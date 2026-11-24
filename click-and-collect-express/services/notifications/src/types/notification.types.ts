// =====================================================================
//  Contrats du notification-service — validation zod + events Socket.io.
//  Copie compatible du registre canonique @cnc/shared :
//   - consomme : order.status_updated (exchange `cnc.orders.events`)
//   - diffuse  : `order.status_updated` aux rooms Socket.io
//                `kitchen` (global) et `order_<orderId>` (client)
// =====================================================================
import { z } from 'zod';

// ── Événement consommé depuis RabbitMQ ───────────────────────────────────────
export const ORDER_EVENTS = {
  ORDER_STATUS_UPDATED: 'order.status_updated',
} as const;

// ── Statuts diffusés (informationnel — le schéma reste permissif) ────────────
export const ORDER_STATUSES = ['PENDING', 'PAID', 'PREPARING', 'READY', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Enveloppe standard de tous les événements du monorepo. */
export interface EventEnvelope<T = unknown> {
  eventId: string;
  eventType: string;
  serviceName: string;
  occurredAt: string;
  payload: T;
}

/**
 * Payload `order.status_updated` publié par order-service.
 * Statuts et reason restent des chaînes permissives : un nouveau statut
 * ajouté côté order-service sera diffusé sans faire dead-letter la file.
 */
export const orderStatusUpdatedPayloadSchema = z.object({
  orderId: z.string().min(1, 'orderId requis'),
  customerName: z.string().min(1),
  previousStatus: z.string().min(1),
  status: z.string().min(1),
  totalAmount: z.number().int().nonnegative(),
  reason: z.string().min(1),
  paymentId: z.string().min(1).optional(),
  occurredAt: z.string().min(1),
});
export type OrderStatusUpdatedPayload = z.infer<typeof orderStatusUpdatedPayloadSchema>;

// ── Événements consommés depuis l'exchange `cnc.catalog.events` ──────────────
// Publiés par catalog-service lors d'un reserve / release / création —
// rediffusés aux clients pour un affichage du stock EN DIRECT sur la carte.
export const CATALOG_EVENTS = {
  PRODUCT_CREATED: 'catalog.product.created',
  PRODUCT_UPDATED: 'catalog.product.updated', // réservé au futur PATCH
  PRODUCT_AVAILABILITY_CHANGED: 'catalog.product.availability_changed',
} as const;

/** Payload d'un événement produit (schéma volontairement permissif). */
export const catalogProductEventPayloadSchema = z.object({
  productId: z.string().min(1, 'productId requis'),
  name: z.string().optional(),
  stock: z.number().int().nonnegative(),
  isAvailable: z.boolean(),
  source: z.enum(['reserve', 'release', 'admin']).optional(),
});
export type CatalogProductEventPayload = z.infer<typeof catalogProductEventPayloadSchema>;

// ── Événements Socket.io (contrat client ⇄ notification-service) ─────────────
export const SOCKET_EVENTS = {
  /** Serveur → client, à la connexion (capabilities + hints). */
  WELCOME: 'notification.welcome',
  /** Client → serveur : rejoindre une room (ack { ok, room?, error? }). */
  ROOM_JOIN: 'room:join',
  /** Client → serveur : quitter une room. */
  ROOM_LEAVE: 'room:leave',
  /** Serveur → client : confirmation de join. */
  ROOM_JOINED: 'room:joined',
  /** Serveur → client : mise à jour de statut (payload OrderStatusUpdatedPayload). */
  STATUS_UPDATED: 'order.status_updated',
  /** Serveur → TOUS les clients : stock produit mis à jour (CatalogProductEventPayload). */
  PRODUCT_UPDATED: 'catalog.product.updated',
} as const;

// ── Rooms ────────────────────────────────────────────────────────────────────

/** Room globale : écran de cuisine — reçoit TOUTES les mises à jour. */
export const KITCHEN_ROOM = 'kitchen';

/** Room dédiée à une commande pour le suivi client. */
export function orderRoom(orderId: string): string {
  return `order_${orderId}`;
}

/**
 * Seules `kitchen` et `order_<orderId>` sont joignables — le slug doit être
 * sûr (pas d'espaces ni de caractères spéciaux, 64 caractères max) pour
 * éviter toute room arbitraire.
 */
export function isAllowedRoom(room: string): boolean {
  return room === KITCHEN_ROOM || /^order_[A-Za-z0-9_-]{1,64}$/.test(room);
}
