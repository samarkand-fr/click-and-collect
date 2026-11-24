// =====================================================================
//  Configuration centrale — variables d'environnement
//  (docker-compose en production, .env en développement)
//
//  Aucune variable n'est OBLIGATOIRE : le service démarre toujours.
//  RabbitMQ est optionnel (reconnexion automatique en arrière-plan)
//  et DATABASE_URL est ignoré : le paiement simulé est stateless
//  (payment-db reste disponible pour une persistance future des reçus).
// =====================================================================
import 'dotenv/config';

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  serviceName: process.env.SERVICE_NAME ?? 'payment-service',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  logLevel: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),

  port: numberEnv('PORT', 3003),

  // ── RabbitMQ — consommation order.created / publication payment.* ─────────
  rabbitmqUrl: process.env.RABBITMQ_URL ?? '',
  ordersExchange: process.env.ORDERS_EXCHANGE ?? 'cnc.orders.events',
  paymentsExchange: process.env.PAYMENTS_EXCHANGE ?? 'cnc.payments.events',
  orderCreatedQueue: process.env.ORDER_CREATED_QUEUE ?? 'payments.order-created',
  orderCreatedQueueDlq:
    process.env.ORDER_CREATED_QUEUE_DLQ ?? 'payments.order-created.dlq',
  paymentsDlx: process.env.PAYMENTS_DLX ?? 'cnc.payments.dlx',
  orderCreatedDeadRoutingKey:
    process.env.ORDER_CREATED_DEAD_ROUTING_KEY ?? 'payments.order-created.dead',
  brokerConfirmTimeoutMs: numberEnv('BROKER_CONFIRM_TIMEOUT_MS', 5_000),

  // ── Provider ──────────────────────────────────────────────────────────────
  // 'mock' implémenté (simulation) ; 'stripe' réservé à une intégration
  // future — averti au démarrage puis replié sur mock.
  provider: process.env.PAYMENT_PROVIDER ?? 'mock',

  // ── Simulation du traitement ──────────────────────────────────────────────
  // Délai de "traitement bancaire" simulé (ms) et taux de succès :
  // un tirage aléatoire < successRate ⇒ paiement accepté, sinon refusé.
  processingTimeMs: Math.max(0, numberEnv('PAYMENT_PROCESSING_MS', 2_000)),
  successRate: Math.min(1, Math.max(0, numberEnv('PAYMENT_SUCCESS_RATE', 0.9))),

  // ── Endpoints de test (/__test/*) ─────────────────────────────────────────
  // Activés par défaut hors production ; forçables via TEST_ENDPOINTS.
  testEndpointsEnabled:
    process.env.TEST_ENDPOINTS === 'true' ||
    (process.env.TEST_ENDPOINTS !== 'false' && process.env.NODE_ENV !== 'production'),
} as const;
