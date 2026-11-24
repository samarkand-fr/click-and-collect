// =====================================================================
//  catalog-service — point d'entrée
//  Bootstrap : seed idempotent → broker (arrière-plan) → serveur HTTP.
// =====================================================================
import express from 'express';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { productRoutes } from './routes/product.routes.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { catalogEvents } from './events/publisher.js';
import { seedProducts } from '../prisma/seed.js';

// ── Application Express ──────────────────────────────────────────────────────
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', true); // le service vit derrière le gateway

app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

// Sonde de vie — interrogée par le healthcheck de docker-compose.
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: config.serviceName,
    uptimeSec: Math.round(process.uptime()),
  });
});

// Routes métier — le gateway les expose publiquement sous /api/v1/catalog/**.
app.use(productRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

// ── Démarrage ────────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  // Seed idempotent (6 produits café / restauration) — SEED_ON_BOOT=false pour désactiver.
  if (config.seedOnBoot) {
    try {
      const result = await seedProducts(prisma);
      logger.info(result, 'Seed du catalogue appliqué');
    } catch (err) {
      // La base doit être migrée au préalable (migrate deploy / db push).
      logger.error({ err }, 'Seed en échec — le service démarre quand même');
    }
  }

  // RabbitMQ : connexion en arrière-plan ; le serveur HTTP démarre même sans broker.
  catalogEvents.init();

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv }, "catalog-service à l'écoute");
  });

  // Arrêt gracieux (docker stop → SIGTERM).
  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Arrêt gracieux...');
    server.close();
    void (async () => {
      try {
        await catalogEvents.close();
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
