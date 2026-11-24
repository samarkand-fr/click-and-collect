// =====================================================================
//  Configuration centrale — tout arrive par variable d'environnement
//  (fournie par docker-compose en production, .env en développement)
// =====================================================================
import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value;
}

export const config = {
  serviceName: 'catalog-service',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  logLevel: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),

  port: Number(process.env.PORT ?? 3001),

  // PostgreSQL — base isolée du service (catalog_db)
  databaseUrl: required('DATABASE_URL'),

  // Broker optionnel : sans RABBITMQ_URL, le service tourne sans publier d'événements.
  rabbitmqUrl: process.env.RABBITMQ_URL ?? '',
  exchangeName: process.env.CATALOG_EXCHANGE ?? 'cnc.catalog.events',

  // Seed idempotent des 6 produits au démarrage (désactivable via env)
  seedOnBoot: process.env.SEED_ON_BOOT !== 'false',
} as const;
