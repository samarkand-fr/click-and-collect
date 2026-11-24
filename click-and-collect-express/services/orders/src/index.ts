// =====================================================================
//  order-service — point d'entrée
//  Bootstrap : broker (connexions + consommation paiement) → serveur HTTP.
// =====================================================================
import express from 'express';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { orderRoutes } from './routes/order.routes.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { broker } from './events/broker.js';
import { paymentEventConsumer } from './events/consumers/payment.consumer.js';

// ── Application Express ──────────────────────────────────────────────────────
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', true); // le service vit derrière le gateway

app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

// Sonde de vie — interrogée par le healthcheck de docker-compose.
// `broker` est indicatif : le service reste "up" même si RabbitMQ est
// indisponible (reconnexion automatique en arrière-plan).
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: config.serviceName,
    uptimeSec: Math.round(process.uptime()),
    broker: broker.state,
  });
});

// Routes métier — le gateway les expose publiquement sous /api/v1/orders/**.
app.use(orderRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

// ── Démarrage ────────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  // Broker : connexion + consommation des événements paiement (non bloquant
  // en cas d'indisponibilité initiale — reconnexion automatique).
  await broker.start(paymentEventConsumer);

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv, broker: broker.state }, "order-service à l'écoute");
  });

  // Arrêt gracieux (docker stop → SIGTERM).
  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Arrêt gracieux...');
    server.close();
    void (async () => {
      try {
        await broker.close();
        await prisma.$disconnect();
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
