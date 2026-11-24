// =====================================================================
//  Configuration centrale — variables d'environnement
//  (docker-compose en production, .env en développement)
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
  serviceName: 'order-service',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  logLevel: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),

  port: Number(process.env.PORT ?? 3002),

  databaseUrl: required('DATABASE_URL'),

  // catalog-service — réservation / libération de stock (HTTP synchrone)
  catalogUrl: required('CATALOG_URL'),
  catalogTimeoutMs: Number(process.env.CATALOG_TIMEOUT_MS ?? 5_000),

  // RabbitMQ — publication order.* / consommation payment.*
  rabbitmqUrl: process.env.RABBITMQ_URL ?? '',
  ordersExchange: process.env.ORDERS_EXCHANGE ?? 'cnc.orders.events',
  paymentsExchange: process.env.PAYMENTS_EXCHANGE ?? 'cnc.payments.events',
  paymentQueue: process.env.PAYMENT_QUEUE ?? 'orders.payment-events',
  paymentQueueDlq: process.env.PAYMENT_QUEUE_DLQ ?? 'orders.payment-events.dlq',
  ordersDlx: process.env.ORDERS_DLX ?? 'cnc.orders.dlx',
  paymentQueueDeadRoutingKey:
    process.env.PAYMENT_QUEUE_DEAD_ROUTING_KEY ?? 'orders.payment-events.dead',
  brokerConfirmTimeoutMs: Number(process.env.BROKER_CONFIRM_TIMEOUT_MS ?? 5_000),
} as const;
