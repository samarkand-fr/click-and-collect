// =====================================================================
//  Configuration centrale — variables d'environnement
//  (docker-compose en production, .env en développement)
//
//  Aucune variable n'est OBLIGATOIRE : le serveur HTTP + WebSocket
//  démarre toujours ; la consommation RabbitMQ est optionnelle
//  (reconnexion automatique en arrière-plan). DATABASE_URL est ignoré :
//  la diffusion est temps réel, sans persistance (notifications-db
//  reste provisionnée pour un futur historique durable).
// =====================================================================
import 'dotenv/config';

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  serviceName: process.env.SERVICE_NAME ?? 'notification-service',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  logLevel: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),

  // HTTP + WebSocket (Socket.io) sur le MÊME port dédié.
  port: numberEnv('PORT', 3004),

  // ── RabbitMQ — consommation order.status_updated ──────────────────────────
  rabbitmqUrl: process.env.RABBITMQ_URL ?? '',
  ordersExchange: process.env.ORDERS_EXCHANGE ?? 'cnc.orders.events',
  statusQueue: process.env.STATUS_QUEUE ?? 'notifications.order-status',
  statusQueueDlq: process.env.STATUS_QUEUE_DLQ ?? 'notifications.order-status.dlq',
  notificationsDlx: process.env.NOTIFICATIONS_DLX ?? 'cnc.notifications.dlx',
  statusDeadRoutingKey:
    process.env.STATUS_DEAD_ROUTING_KEY ?? 'notifications.order-status.dead',

  // ── RabbitMQ — consommation catalog.product.* (stock en direct) ───────────
  catalogExchange: process.env.CATALOG_EXCHANGE ?? 'cnc.catalog.events',
  catalogQueue: process.env.CATALOG_QUEUE ?? 'notifications.catalog',
  catalogQueueDlq: process.env.CATALOG_QUEUE_DLQ ?? 'notifications.catalog.dlq',
  catalogDeadRoutingKey:
    process.env.CATALOG_DEAD_ROUTING_KEY ?? 'notifications.catalog.dead',

  // ── Socket.io ─────────────────────────────────────────────────────────────
  // Origines autorisées : '*' (dev — reflète l'origine du client) ou liste
  // séparée par des virgules (ex : 'http://localhost:5173,http://localhost:8080').
  corsOrigin: process.env.CORS_ORIGIN ?? '*',

  // ── Endpoints de test (/__test/*) ─────────────────────────────────────────
  // Activés par défaut hors production ; forçables via TEST_ENDPOINTS.
  testEndpointsEnabled:
    process.env.TEST_ENDPOINTS === 'true' ||
    (process.env.TEST_ENDPOINTS !== 'false' && process.env.NODE_ENV !== 'production'),
} as const;
