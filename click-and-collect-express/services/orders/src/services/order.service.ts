// =====================================================================
//  Couche métier du order-service
//
//  Flux de création (POST /orders) :
//    1. catalog-service POST /products/reserve → vérifie les PRIX et
//       réserve le stock de manière atomique (404/409 → rien n'est créé).
//    2. Order créée en base avec le statut PENDING, total calculé depuis
//       les prix autoritaires du catalogue.
//    3. order.created publié avec PUBLISHER CONFIRM — en cas d'échec
//       après réservation → compensation POST /products/release.
//
//  Machine à états :
//    PENDING → PAID       (payment.succeeded) → order.status_updated
//    PENDING → CANCELLED  (payment.failed)    → order.status_updated
//                                                  + release du stock
//    PAID → PREPARING → READY (cuisine, PATCH) → order.status_updated
// =====================================================================
import { Prisma, type Order } from '../generated/prisma/index.js';
import { prisma } from '../lib/prisma.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { catalogClient } from '../clients/catalog.client.js';
import { broker } from '../events/broker.js';
import {
  ORDER_EVENTS,
  parseOrderItems,
  type CreateOrderDto,
  type OrderItemSnapshot,
  type OrderStatus,
  type PaymentEventData,
} from '../types/order.types.js';

/** Transitions autorisées par la cuisine : PAID → PREPARING → READY. */
const KITCHEN_TRANSITIONS: Partial<Record<OrderStatus, 'PREPARING' | 'READY'>> = {
  PAID: 'PREPARING',
  PREPARING: 'READY',
};

export const orderService = {
  async createOrder(dto: CreateOrderDto): Promise<Order> {
    // 1. Réservation atomique du stock + vérification des prix.
    //    Toute erreur (404 produit inconnu, 409 stock/prix, 502/503) est
    //    propagée au client SANS créer de commande ni publier d'événement.
    const reserveResult = await catalogClient.reserveItems(
      dto.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        expectedPrice: item.expectedPrice,
      })),
    );

    // 2. Snapshots immuables + total calculé côté serveur (prix catalogue).
    const reservedItems =
      reserveResult?.items ??
      (reserveResult as unknown as { data?: { items?: typeof reserveResult.items } })?.data?.items ??
      [];
    const snapshots: OrderItemSnapshot[] = reservedItems.map((item) => ({
      productId: item.productId,
      name: item.name,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      subtotal: item.subtotal,
    }));
    const totalAmount = snapshots.reduce((sum, item) => sum + item.subtotal, 0);

    try {
      const order = await prisma.order.create({
        data: {
          customerName: dto.customerName,
          items: snapshots as unknown as Prisma.InputJsonValue,
          totalAmount,
        },
      });

      // 3. Publication confirmée de order.created — déclenche le paiement
      //    côté payment-service. Si le broker n'acquitte pas → compensation.
      await broker.publishConfirmed(ORDER_EVENTS.ORDER_CREATED, {
        orderId: order.id,
        customerName: order.customerName,
        items: snapshots,
        totalAmount,
        createdAt: order.createdAt.toISOString(),
      });

      logger.info({ orderId: order.id, totalAmount }, 'Commande créée (PENDING)');
      return order;
    } catch (err) {
      // Compensation : le stock est réservé mais la commande n'existe pas
      // (ou l'événement n'a pas pu être publié) → on libère le stock.
      logger.error({ err }, 'Création de commande en échec — libération du stock réservé');
      await catalogClient
        .releaseItems(dto.items.map((item) => ({ productId: item.productId, quantity: item.quantity })))
        .catch((releaseErr) => {
          logger.fatal(
            { releaseErr },
            'Libération impossible après échec de création — fuite de stock à réconcilier',
          );
        });
      throw err;
    }
  },

  /** GET /orders?status= — tableau de bord cuisine / suivi client. */
  async listOrders(status?: OrderStatus): Promise<Order[]> {
    return prisma.order.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  },

  async getOrder(orderId: string): Promise<Order> {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundError(`Commande introuvable : ${orderId}`);
    }
    return order;
  },

  /** payment.succeeded → PENDING → PAID (+ order.status_updated). */
  async applyPaymentSucceeded(data: PaymentEventData): Promise<void> {
    const order = await prisma.order.findUnique({ where: { id: data.orderId } });

    if (!order) {
      logger.warn({ data }, 'payment.succeeded pour une commande inconnue — ignoré');
      return;
    }
    if (order.status === 'PAID') {
      logger.info({ orderId: order.id }, 'Paiement déjà appliqué (idempotence) — ignoré');
      return;
    }
    if (order.status !== 'PENDING') {
      logger.error(
        { orderId: order.id, status: order.status },
        'payment.succeeded reçu dans un état inattendu — ignoré',
      );
      return;
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: 'PAID' },
    });

    await broker.publishConfirmed(ORDER_EVENTS.ORDER_STATUS_UPDATED, {
      orderId: updated.id,
      customerName: updated.customerName,
      previousStatus: 'PENDING',
      status: 'PAID',
      totalAmount: updated.totalAmount,
      reason: 'payment_succeeded',
      paymentId: data.paymentId,
      occurredAt: new Date().toISOString(),
    });

    logger.info({ orderId: updated.id, paymentId: data.paymentId }, 'Commande payée (PAID)');
  },

  /**
   * payment.failed → PENDING → CANCELLED (+ order.status_updated)
   * puis libération du stock chez catalog-service (compensation saga).
   */
  async applyPaymentFailed(data: PaymentEventData): Promise<void> {
    const order = await prisma.order.findUnique({ where: { id: data.orderId } });

    if (!order) {
      logger.warn({ data }, 'payment.failed pour une commande inconnue — ignoré');
      return;
    }
    if (order.status === 'CANCELLED') {
      logger.info({ orderId: order.id }, 'Commande déjà annulée (idempotence) — ignoré');
      return;
    }
    if (order.status !== 'PENDING') {
      logger.error(
        { orderId: order.id, status: order.status },
        'payment.failed reçu dans un état inattendu — ignoré',
      );
      return;
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: 'CANCELLED' },
    });

    await broker.publishConfirmed(ORDER_EVENTS.ORDER_STATUS_UPDATED, {
      orderId: updated.id,
      customerName: updated.customerName,
      previousStatus: 'PENDING',
      status: 'CANCELLED',
      totalAmount: updated.totalAmount,
      reason: 'payment_failed',
      paymentId: data.paymentId,
      occurredAt: new Date().toISOString(),
    });

    // Compensation : libération du stock à partir du snapshot de la commande.
    const items = parseOrderItems(updated.items);
    await catalogClient
      .releaseItems(items.map((item) => ({ productId: item.productId, quantity: item.quantity })))
      .catch((releaseErr) => {
        logger.fatal(
          { releaseErr, orderId: order.id },
          'Libération de stock en échec après annulation — à réconcilier',
        );
      });

    logger.info({ orderId: order.id }, 'Commande annulée (CANCELLED), stock libéré');
  },

  /**
   * PATCH /orders/:id/status — machine à états cuisine :
   * PAID → PREPARING → READY. Toute autre transition → 409 avec détail.
   */
  async kitchenTransition(orderId: string, target: 'PREPARING' | 'READY'): Promise<Order> {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundError(`Commande introuvable : ${orderId}`);
    }

    const expected = KITCHEN_TRANSITIONS[order.status];
    if (expected !== target) {
      throw new ConflictError(`Transition de statut invalide : ${order.status} → ${target}`, {
        currentStatus: order.status,
        requestedStatus: target,
        allowedNextStatus: expected ?? null,
      });
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { status: target },
    });

    await broker.publishConfirmed(ORDER_EVENTS.ORDER_STATUS_UPDATED, {
      orderId: updated.id,
      customerName: updated.customerName,
      previousStatus: order.status,
      status: target,
      totalAmount: updated.totalAmount,
      reason: 'kitchen_update',
      occurredAt: new Date().toISOString(),
    });

    logger.info({ orderId: updated.id, previousStatus: order.status, status: target }, 'Statut mis à jour (cuisine)');
    return updated;
  },
};
