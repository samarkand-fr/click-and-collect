// =====================================================================
//  Routes HTTP du notification-service.
//  Le gateway les exposera sous /api/v1/notifications/** (le WebSocket
//  sera proxifié par le gateway à l'étape suivante ; en attendant, le
//  port 3004 est publié sur 127.0.0.1 pour les tests locaux).
// =====================================================================
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { notificationService } from '../services/notification.service.js';
import { realtimeHub } from '../realtime/socket-server.js';
import { DEMO_PAGE_HTML } from '../realtime/demo-page.js';
import type { OrderStatusUpdatedPayload } from '../types/notification.types.js';

export const notificationRoutes = Router();

// ── Consultation ─────────────────────────────────────────────────────────────

/** GET /events/recent?orderId= — historique pour les écrans qui (re)chargent. */
notificationRoutes.get('/events/recent', (req, res) => {
  const orderId = typeof req.query.orderId === 'string' ? req.query.orderId : undefined;
  res.json({
    events: notificationService.recentEvents(orderId),
    note: 'Historique en mémoire — réinitialisé au redémarrage du service',
  });
});

/** GET /realtime/stats — diagnostic des rooms Socket.io. */
notificationRoutes.get('/realtime/stats', (_req, res) => {
  res.json({
    connectedSockets: realtimeHub.connectedSockets,
    rooms: realtimeHub.roomsSnapshot(),
    ...notificationService.stats,
  });
});

/**
 * GET /demo — page de démonstration (écran cuisine + suivi client).
 * Si la requête passe par un proxy ajoutant ?XTransformPort=<port>, les
 * URLs socket/fetch de la page sont réécrites en conséquence.
 */
notificationRoutes.get('/demo', (req, res) => {
  const xtp = new URL(req.url, 'http://internal').searchParams.get('XTransformPort');
  const query = xtp ? `?XTransformPort=${encodeURIComponent(xtp)}` : '';
  const ioUrl = xtp ? `/?XTransformPort=${encodeURIComponent(xtp)}` : '';
  res
    .type('html')
    .send(
      DEMO_PAGE_HTML.replaceAll('%%SOCKET_SRC%%', `/socket.io/socket.io.js${query}`)
        .replaceAll('%%XTPQ%%', query)
        .replaceAll('%%IO_URL%%', ioUrl),
    );
});

// ── Endpoints de test (/__test/*) — désactivés en production ─────────────────

const testStatusSchema = z.object({
  orderId: z.string().min(1).optional(),
  customerName: z.string().trim().min(1).max(100).optional(),
  previousStatus: z.string().min(1).max(50).optional(),
  status: z.string().min(1).max(50).optional(),
  totalAmount: z.number().int().nonnegative().optional(), // centimes
  reason: z.string().min(1).max(100).optional(),
  paymentId: z.string().min(1).optional(),
});

const testProductSchema = z.object({
  productId: z.string().min(1).optional(),
  name: z.string().min(1).max(120).optional(),
  stock: z.number().int().nonnegative().optional(),
  isAvailable: z.boolean().optional(),
  source: z.enum(['reserve', 'release', 'admin']).optional(),
});

export function buildTestRoutes(): Router {
  const router = Router();

  /**
   * POST /__test/status-update — injecte une mise à jour de statut dans le
   * MÊME pipeline qu'un événement RabbitMQ réel (validation → historique →
   * diffusion sur kitchen + order_<id>). Permet de tester les rooms sans
   * broker ni order-service.
   */
  router.post('/__test/status-update', async (req, res) => {
    const input = testStatusSchema.parse(req.body ?? {});
    const payload: OrderStatusUpdatedPayload = {
      orderId: input.orderId ?? randomUUID(),
      customerName: input.customerName ?? 'Client démo',
      previousStatus: input.previousStatus ?? 'PAID',
      status: input.status ?? 'PREPARING',
      totalAmount: input.totalAmount ?? 4500,
      reason: input.reason ?? 'kitchen_update',
      ...(input.paymentId ? { paymentId: input.paymentId } : {}),
      occurredAt: new Date().toISOString(),
    };

    await notificationService.onOrderStatusUpdated(payload);
    res.json({ broadcast: true, payload });
  });

  /**
   * POST /__test/product-update — injecte un événement `catalog.product.*`
   * (stock en direct) dans le MÊME pipeline qu'un message RabbitMQ réel
   * : validation → diffusion Socket.io `catalog.product.updated` à tous.
   */
  router.post('/__test/product-update', async (req, res) => {
    const input = testProductSchema.parse(req.body ?? {});
    const payload = {
      productId: input.productId ?? randomUUID(),
      ...(input.name ? { name: input.name } : {}),
      stock: input.stock ?? 3,
      isAvailable: input.isAvailable ?? true,
      ...(input.source ? { source: input.source } : {}),
    };

    await notificationService.onCatalogProductEvent(payload);
    res.json({ broadcast: true, payload });
  });

  return router;
}
