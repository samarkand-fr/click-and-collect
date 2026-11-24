// =====================================================================
//  Configuration centrale du gateway — variables d'environnement
//  (docker-compose en production, .env en développement)
//
//  Toutes les URLs des microservices sont OBLIGATOIRES : le gateway
//  est le point d'entrée unique, il ne peut pas démarrer aveugle.
// =====================================================================
import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value;
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const config = {
  serviceName: process.env.SERVICE_NAME ?? 'api-gateway',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  logLevel: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),

  port: numberEnv('PORT', 8080),

  // ── Microservices en amont (noms Docker réseau interne) ───────────────────
  catalogUrl: required('CATALOG_URL'),             // ex : http://catalog-service:3001
  ordersUrl: required('ORDERS_URL'),               // ex : http://orders-service:3002
  paymentUrl: required('PAYMENT_URL'),             // ex : http://payment-service:3003
  notificationsUrl: required('NOTIFICATIONS_URL'), // ex : http://notifications-service:3004

  // ── CORS ──────────────────────────────────────────────────────────────────
  // '*' (dev) ou liste séparée par des virgules (ex : http://localhost:5173).
  corsOrigin: process.env.CORS_ORIGIN ?? '*',

  // ── Rate-limiting global (fenêtre glissante par IP) ───────────────────────
  rateLimitWindowMs: numberEnv('RATE_LIMIT_WINDOW_MS', 60_000),
  rateLimitMax: numberEnv('RATE_LIMIT_MAX', 120),

  // ── Proxy vers les microservices ──────────────────────────────────────────
  proxyTimeoutMs: numberEnv('PROXY_TIMEOUT_MS', 15_000),
} as const;
