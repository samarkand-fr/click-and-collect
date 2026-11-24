// =====================================================================
//  notification-service — point d'entrée
//
//  Flux : order.status_updated (file `notifications.order-status`) →
//  validation → diffusion Socket.io sur DEUX canaux :
//    - room globale `kitchen` (écran cuisine)
//    - room `order_<orderId>` (suivi client)
//
//  Le serveur WebSocket (Socket.io) et le HTTP partagent le port dédié :
//  bootstrap = application Express → serveur HTTP → Socket.io → broker.
// =====================================================================
import { createServer } from 'node:http';
import express from 'express';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { notificationBroker } from './events/broker.js';
import { notificationService } from './services/notification.service.js';
import { realtimeHub } from './realtime/socket-server.js';
import { buildTestRoutes, notificationRoutes } from './routes/notification.routes.js';

// ── Application Express ──────────────────────────────────────────────────────
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', true); // le service vit derrière le gateway

app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

// Sonde de vie — interrogée par le healthcheck de docker-compose.
// `broker` et `realtime` sont indicatifs : le service reste "up" même si
// RabbitMQ est indisponible (reconnexion automatique en arrière-plan).
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: config.serviceName,
    uptimeSec: Math.round(process.uptime()),
    broker: notificationBroker.state,
    realtime: {
      connectedSockets: realtimeHub.connectedSockets,
      rooms: realtimeHub.roomsSnapshot(),
    },
  });
});

// Routes métier — le gateway les expose sous /api/v1/notifications/**.
app.use(notificationRoutes);

// Endpoints de test (POST /__test/*) — désactivés en production.
if (config.testEndpointsEnabled) {
  app.use(buildTestRoutes());
  logger.info('Endpoints de test activés : POST /__test/status-update');
}

app.use(notFoundHandler);
app.use(errorHandler);

// ── Serveur HTTP + WebSocket (Socket.io) sur le port dédié ───────────────────
const httpServer = createServer(app);
realtimeHub.init(httpServer);

// ── Démarrage ────────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  // Broker : connexion + consommation order.status_updated (non bloquant en
  // cas d'indisponibilité initiale — reconnexion automatique en arrière-plan).
  await notificationBroker.start(notificationService);

  httpServer.listen(config.port, () => {
    logger.info(
      {
        port: config.port,
        env: config.nodeEnv,
        broker: notificationBroker.state,
        corsOrigin: config.corsOrigin,
        testEndpoints: config.testEndpointsEnabled,
        rooms: ['kitchen', 'order_<orderId>'],
      },
      "notification-service à l'écoute (HTTP + WebSocket)",
    );
  });

  // Arrêt gracieux (docker stop → SIGTERM) : coupe d'abord les WebSocket,
  // puis le serveur HTTP, puis la connexion RabbitMQ.
  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Arrêt gracieux...');
    httpServer.close();
    void (async () => {
      try {
        await realtimeHub.close();
        await notificationBroker.close();
      } finally {
        process.exit(0);
      }
    })();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Démarrage impossible');
  process.exit(1);
});
