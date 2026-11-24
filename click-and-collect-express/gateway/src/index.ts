// =====================================================================
//  API Gateway — point d'entrée UNIQUE du système (port 8080).
//
//  Pile de middlewares (ordre significatif) :
//    1. requestLogger      → une ligne JSON par requête
//    2. cors               → Access-Control-* (CORS_ORIGIN, '*' en dev)
//    3. globalRateLimiter  → limite par IP, JSON 429 homogène
//    4. GET /health        → sonde de vie (healthcheck docker-compose)
//    5. GET /              → carte des routes (documentation vivante)
//    6. proxyRouter        → /api/products, /api/orders, /api/payments,
//                            /api/notifications, /socket.io (HTTP)
//    7. notFoundHandler    → JSON 404 homogène
//    8. errorHandler       → JSON 500 homogène
//
//  Hors pile Express : server.on('upgrade') → socketUpgradeHandler
//  (proxy WebSocket /socket.io → notification-service).
// =====================================================================
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { requestLogger } from './middleware/requestLogger.js';
import { globalRateLimiter } from './middleware/rateLimit.middleware.js';
import { proxyRouter, socketUpgradeHandler } from './middleware/proxy.middleware.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';

// ── Application Express ──────────────────────────────────────────────────────
const app = express();

app.disable('x-powered-by');

app.use(requestLogger);

// CORS : en dev, reflète l'origine du client ; sinon liste explicite.
app.use(
  cors({
    origin:
      config.corsOrigin === '*'
        ? true
        : config.corsOrigin.split(',').map((origin) => origin.trim()),
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: false,
  }),
);

// Rate-limiting global (JSON 429 homogène — cf. rateLimit.middleware.ts).
app.use(globalRateLimiter);

// Sonde de vie — interrogée par le healthcheck de docker-compose.
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: config.serviceName,
    uptimeSec: Math.round(process.uptime()),
  });
});

// Carte des routes — documentation vivante du point d'entrée unique.
app.get('/', (_req, res) => {
  res.json({
    service: config.serviceName,
    message: "API Gateway Click & Collect Express — point d'entrée unique",
    routes: {
      'GET /api/products': 'catalog-service — liste de la carte (disponibles)',
      'GET /api/products/:id': 'catalog-service — détail produit',
      'POST /api/products': 'catalog-service — création (back-office)',
      'POST /api/products/reserve': 'catalog-service — réservation de stock (interne orders-service)',
      'POST /api/products/release': 'catalog-service — libération de stock (compensation)',
      'POST /api/orders': 'orders-service — création de commande',
      'GET /api/orders': 'orders-service — liste (écran cuisine / suivi)',
      'GET /api/orders/:id': 'orders-service — détail / suivi client',
      'PATCH /api/orders/:id/status': 'orders-service — transitions cuisine (PREPARING / READY)',
      'GET /api/payments/:orderId': 'payment-service — résultat du paiement',
      'GET /api/notifications/events/recent': 'notifications-service — historique récent',
      'GET /api/notifications/realtime/stats': 'notifications-service — statistiques Socket.io',
      'WS /socket.io': 'notifications-service — temps réel (rooms kitchen / order_<id>)',
    },
    aliases: '/api/v1/** est un alias équivalent de /api/**',
  });
});

// Proxy inverse REST + WebSocket (polling HTTP).
app.use(proxyRouter);

app.use(notFoundHandler);
app.use(errorHandler);

// ── Serveur HTTP + montée WebSocket ──────────────────────────────────────────
const server = app.listen(config.port, () => {
  logger.info(
    {
      port: config.port,
      env: config.nodeEnv,
      routes: [
        '/api/products → catalog-service',
        '/api/orders → orders-service',
        '/api/payments → payment-service',
        '/api/notifications → notifications-service',
        '/socket.io → notifications-service (HTTP + WebSocket)',
      ],
      rateLimit: { windowMs: config.rateLimitWindowMs, max: config.rateLimitMax },
      corsOrigin: config.corsOrigin,
    },
    "API Gateway à l'écoute",
  );
});

// Les requêtes `Upgrade: websocket` ne passent pas par Express.
server.on('upgrade', socketUpgradeHandler);

// ── Arrêt gracieux (docker stop → SIGTERM) ───────────────────────────────────
const shutdown = (signal: string): void => {
  logger.info({ signal }, 'Arrêt gracieux...');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
