// =====================================================================
//  payment-service — point d'entrée
//
//  Flux : order.created (file `payments.order-created`) → traitement
//  simulé 2 s (90 % succès / 10 % échec, ou forceOutcome en test) →
//  publication payment.succeeded / payment.failed (publisher confirms)
//  sur `cnc.payments.events`.
//
//  Bootstrap : broker (consommation) → serveur HTTP (/health + routes).
// =====================================================================
import express from 'express';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { paymentBroker } from './events/broker.js';
import { orderCreatedConsumer } from './events/consumers/order.consumer.js';
import { buildTestRoutes, paymentRoutes } from './routes/payment.routes.js';

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
    broker: paymentBroker.state,
    provider: config.provider,
    simulation: {
      processingTimeMs: config.processingTimeMs,
      successRate: config.successRate,
    },
  });
});

// Routes métier — le gateway les expose sous /api/v1/payments/**.
app.use(paymentRoutes);

// Endpoints de test (POST /__test/*) — désactivés en production.
if (config.testEndpointsEnabled) {
  app.use(buildTestRoutes());
  logger.info('Endpoints de test activés : POST /__test/process-payment, POST /__test/simulate-order-created');
}

app.use(notFoundHandler);
app.use(errorHandler);

// ── Démarrage ────────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  if (config.provider !== 'mock') {
    logger.warn(
      { provider: config.provider },
      "Provider non mock configuré mais non intégré — repli sur la simulation (mock)",
    );
  }

  // Broker : connexion + consommation order.created (non bloquant en cas
  // d'indisponibilité initiale — reconnexion automatique en arrière-plan).
  await paymentBroker.start(orderCreatedConsumer);

  const server = app.listen(config.port, () => {
    logger.info(
      {
        port: config.port,
        env: config.nodeEnv,
        broker: paymentBroker.state,
        provider: config.provider,
        processingTimeMs: config.processingTimeMs,
        successRate: config.successRate,
        testEndpoints: config.testEndpointsEnabled,
      },
      "payment-service à l'écoute",
    );
  });

  // Arrêt gracieux (docker stop → SIGTERM).
  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Arrêt gracieux...');
    server.close();
    void (async () => {
      try {
        await paymentBroker.close();
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
