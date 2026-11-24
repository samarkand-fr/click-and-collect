// =====================================================================
//  Routes HTTP du payment-service.
//  Le gateway les expose publiquement sous /api/v1/payments/**.
//  Historique et consultation : mémoire du process (simulation).
// =====================================================================
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { NotFoundError } from '../lib/errors.js';
import { paymentStore } from '../services/payment-store.js';
import { paymentProcessor } from '../services/payment-processor.js';
import { paymentBroker } from '../events/broker.js';
import { type OrderCreatedPayload } from '../types/payment.types.js';

export const paymentRoutes = Router();

// ── Consultation ─────────────────────────────────────────────────────────────

/** GET /payments — derniers traitements (mémoire du process). */
paymentRoutes.get('/payments', (_req, res) => {
  res.json({
    payments: paymentStore.listRecent(100),
    note: 'Historique en mémoire (simulation) — réinitialisé au redémarrage du service',
  });
});

/** GET /payments/:orderId — résultat du paiement d'une commande. */
paymentRoutes.get('/payments/:orderId', (req, res) => {
  const record = paymentStore.getByOrderId(req.params.orderId);
  if (!record) {
    throw new NotFoundError(`Aucun paiement enregistré pour la commande : ${req.params.orderId}`);
  }
  res.json({ payment: record });
});

// ── Endpoints de test (/__test/*) — désactivés en production ─────────────────
//
//  Contrôle de l'issue du paiement ("paramètre de test") :
//    - forceOutcome: 'success' | 'failure' → issue forcée,
//    - omis → tirage aléatoire 90 % succès / 10 % échec.

const testPaymentSchema = z.object({
  orderId: z.string().min(1).optional(),
  customerName: z.string().trim().min(1).max(100).optional(),
  totalAmount: z.number().int().positive().max(10_000_000).optional(), // centimes
  forceOutcome: z.enum(['success', 'failure']).optional(),
});

/** Construit un payload order.created valide à partir du corps de test. */
function buildTestOrderPayload(body: unknown): OrderCreatedPayload {
  const input = testPaymentSchema.parse(body ?? {});
  const totalAmount = input.totalAmount ?? 4500; // 45,00 € par défaut

  return {
    orderId: input.orderId ?? randomUUID(),
    customerName: input.customerName ?? 'Client démo',
    items: [
      {
        productId: 'demo-espresso',
        name: 'Espresso (démo)',
        unitPrice: totalAmount,
        quantity: 1,
        subtotal: totalAmount,
      },
    ],
    totalAmount,
    createdAt: new Date().toISOString(),
    ...(input.forceOutcome ? { forceOutcome: input.forceOutcome } : {}),
  };
}

export function buildTestRoutes(): Router {
  const router = Router();

  /**
   * POST /__test/simulate-order-created
   * Boucle COMPLÈTE : publie un order.created sur `cnc.orders.events`
   * (publisher confirms) → le service le consomme lui-même → traite le
   * paiement (2 s) → publie payment.succeeded / payment.failed.
   * Sans RabbitMQ (dev local) : traitement direct, sans publication.
   */
  router.post('/__test/simulate-order-created', async (req, res) => {
    const payload = buildTestOrderPayload(req.body);

    if (!paymentBroker.isEnabled) {
      const record = await paymentProcessor.processOrderCreated(payload);
      res.json({
        mode: 'local',
        brokerEnabled: false,
        order: payload,
        payment: record,
        note: 'RABBITMQ_URL absent — traitement direct sans publication',
      });
      return;
    }

    await paymentBroker.publishOrderCreatedForTest(payload);
    res.json({
      mode: 'broker',
      brokerEnabled: true,
      orderId: payload.orderId,
      note: 'order.created publié — suivre payment.* dans les logs (~2 s)',
    });
  });

  /**
   * POST /__test/process-payment
   * Teste UNIQUEMENT le processeur (délai 2 s + issue aléatoire/forcée),
   * sans broker ni publication — idéal pour vérifier le paramètre de test.
   */
  router.post('/__test/process-payment', async (req, res) => {
    const payload = buildTestOrderPayload(req.body);
    const record = await paymentProcessor.processOrderCreated(payload);
    res.json({ mode: 'local', payment: record });
  });

  return router;
}
