// =====================================================================
//  Broker RabbitMQ du order-service
//
//  - Publisher : exchange topic `cnc.orders.events` + PUBLISHER CONFIRMS
//    (publishConfirmed → Promise résolue après ack du broker, avec timeout).
//    Permet à l'appelant de compenser si le message n'a pas été publié.
//  - Consumer : file `orders.payment-events` ← payment.succeeded /
//    payment.failed, avec dead-letter (`cnc.orders.dlx` → `.dlq`).
//
//  La topologie est re-assertée à chaque (re)connexion : les services
//  peuvent démarrer dans n'importe quel ordre.
// =====================================================================
import { randomUUID } from 'node:crypto';
import {
  connect,
  type Channel,
  type ChannelModel,
  type ConsumeMessage,
  type ConfirmChannel,
} from 'amqplib';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { ServiceUnavailableError } from '../lib/errors.js';
import {
  ORDER_EVENTS,
  PAYMENT_EVENTS,
  type OrderEventType,
  type OrdersEventEnvelope,
} from '../types/order.types.js';

const RECONNECT_DELAY_MS = 5_000;

export type BrokerState = 'disabled' | 'connecting' | 'connected' | 'reconnecting';

export interface PaymentEventHandler {
  onPaymentSucceeded(payload: unknown): Promise<void>;
  onPaymentFailed(payload: unknown): Promise<void>;
}

class OrdersBroker {
  private connection: ChannelModel | null = null;
  private publishChannel: ConfirmChannel | null = null;
  private consumeChannel: Channel | null = null;
  private reconnecting = false;
  private closed = false;
  private handler: PaymentEventHandler | null = null;

  get isEnabled(): boolean {
    return config.rabbitmqUrl.length > 0;
  }

  /** État indicatif exposé par /health (ne fait pas échouer le healthcheck). */
  get state(): BrokerState {
    if (!this.isEnabled) return 'disabled';
    if (this.publishChannel) return 'connected';
    return this.reconnecting ? 'reconnecting' : 'connecting';
  }

  /**
   * Démarre la connexion et la consommation. Le premier échec n'est pas
   * bloquant : le serveur HTTP démarre quand même (reconnexion en fond).
   */
  async start(handler: PaymentEventHandler): Promise<void> {
    this.handler = handler;
    if (!this.isEnabled) {
      logger.warn("RABBITMQ_URL absent — événements désactivés (POST /orders renverra 503)");
      return;
    }
    try {
      await this.connect();
    } catch (err) {
      logger.warn({ err }, 'RabbitMQ indisponible au démarrage — reconnexion en arrière-plan');
      this.scheduleReconnect('échec de connexion initial');
    }
  }

  private async connect(): Promise<void> {
    if (this.closed) return;

    const connection = await connect(config.rabbitmqUrl, { heartbeat: 15 });
    connection.on('error', (err) => logger.error({ err }, 'Connexion RabbitMQ en erreur'));
    connection.on('close', () => {
      this.publishChannel = null;
      this.consumeChannel = null;
      this.scheduleReconnect('connexion fermée');
    });

    // ── Publisher : confirm channel sur l'exchange des commandes ─────────────
    const publishChannel = await connection.createConfirmChannel();
    publishChannel.on('error', (err) => logger.error({ err }, 'Canal de publication en erreur'));
    publishChannel.on('close', () => {
      this.publishChannel = null;
    });
    await publishChannel.assertExchange(config.ordersExchange, 'topic', { durable: true });

    // ── Consumer : topologie paiement + dead-letter ──────────────────────────
    const consumeChannel = await connection.createChannel();
    consumeChannel.on('error', (err) => logger.error({ err }, 'Canal de consommation en erreur'));
    consumeChannel.on('close', () => {
      this.consumeChannel = null;
    });

    await consumeChannel.assertExchange(config.paymentsExchange, 'topic', { durable: true });
    await consumeChannel.assertExchange(config.ordersDlx, 'topic', { durable: true });

    await consumeChannel.assertQueue(config.paymentQueue, {
      durable: true,
      deadLetterExchange: config.ordersDlx,
      deadLetterRoutingKey: config.paymentQueueDeadRoutingKey,
    });
    await consumeChannel.bindQueue(config.paymentQueue, config.paymentsExchange, PAYMENT_EVENTS.SUCCEEDED);
    await consumeChannel.bindQueue(config.paymentQueue, config.paymentsExchange, PAYMENT_EVENTS.FAILED);

    await consumeChannel.assertQueue(config.paymentQueueDlq, { durable: true });
    await consumeChannel.bindQueue(
      config.paymentQueueDlq,
      config.ordersDlx,
      config.paymentQueueDeadRoutingKey,
    );

    await consumeChannel.prefetch(1);
    await consumeChannel.consume(config.paymentQueue, (msg) => void this.onMessage(consumeChannel, msg));

    this.connection = connection;
    this.publishChannel = publishChannel;
    this.consumeChannel = consumeChannel;
    this.reconnecting = false;
    logger.info(
      {
        ordersExchange: config.ordersExchange,
        paymentQueue: config.paymentQueue,
        bindings: [PAYMENT_EVENTS.SUCCEEDED, PAYMENT_EVENTS.FAILED],
      },
      'Broker RabbitMQ prêt (publication + consommation)',
    );
  }

  private scheduleReconnect(reason: string): void {
    if (this.closed || this.reconnecting) return;
    this.reconnecting = true;
    logger.info({ reason, delayMs: RECONNECT_DELAY_MS }, 'Reconnexion RabbitMQ programmée');
    setTimeout(() => {
      this.reconnecting = false;
      this.connect()
        .then(() => undefined)
        .catch((err) => {
          logger.warn({ err }, 'Reconnexion RabbitMQ en échec — nouvelle tentative programmée');
          this.scheduleReconnect('échec de reconnexion');
        });
    }, RECONNECT_DELAY_MS).unref();
  }

  private async onMessage(channel: Channel, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;
    const routingKey = msg.fields.routingKey;
    const messageId = msg.properties.messageId ?? '(sans id)';

    try {
      const event = JSON.parse(msg.content.toString('utf8')) as OrdersEventEnvelope;
      if (event?.payload === undefined) {
        throw new Error("Enveloppe d'événement invalide (payload absent)");
      }

      if (routingKey === PAYMENT_EVENTS.SUCCEEDED) {
        await this.handler?.onPaymentSucceeded(event.payload);
      } else if (routingKey === PAYMENT_EVENTS.FAILED) {
        await this.handler?.onPaymentFailed(event.payload);
      } else {
        logger.warn({ routingKey, messageId }, 'Événement non géré sur la file paiement — acquitté');
      }

      channel.ack(msg);
    } catch (err) {
      // Pas de requeue : éviter la boucle infinie de redelivery ;
      // l'événement part en DLQ pour inspection / rejeu manuel.
      logger.error({ err, routingKey, messageId }, "Traitement de l'événement en échec → dead-letter");
      channel.nack(msg, false, false);
    }
  }

  /**
   * Publication avec confirmation du broker (publisher confirms).
   * Résolue uniquement après ack de RabbitMQ → l'appelant peut compenser
   * (ex : libérer le stock) si le message n'a pas pu être publié.
   */
  async publishConfirmed(eventType: OrderEventType, payload: unknown): Promise<void> {
    const channel = this.publishChannel;
    if (!channel) {
      throw new ServiceUnavailableError('Broker RabbitMQ indisponible — publication impossible');
    }

    const event: OrdersEventEnvelope<unknown> = {
      eventId: randomUUID(),
      eventType,
      serviceName: 'order-service',
      occurredAt: new Date().toISOString(),
      payload,
    };

    channel.publish(
      config.ordersExchange,
      eventType, // routing key = type d'événement (order.created, order.status_updated)
      Buffer.from(JSON.stringify(event), 'utf8'),
      {
        persistent: true,
        contentType: 'application/json',
        messageId: event.eventId,
        type: eventType,
      },
    );

    // Attente de la confirmation avec timeout ; le rejet tardif de
    // waitForConfirms est neutralisé si le timeout gagne la course.
    const confirmed = channel.waitForConfirms();
    void confirmed.catch(() => {});
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(
        () =>
          reject(
            new ServiceUnavailableError(
              `Confirmation RabbitMQ non reçue après ${config.brokerConfirmTimeoutMs} ms`,
            ),
          ),
        config.brokerConfirmTimeoutMs,
      ).unref();
    });

    await Promise.race([confirmed, timeout]);
  }

  async close(): Promise<void> {
    this.closed = true;
    try {
      await this.consumeChannel?.close();
      await this.publishChannel?.close();
      await this.connection?.close();
    } catch {
      // Le broker est peut-être déjà parti : rien à faire.
    }
    this.consumeChannel = null;
    this.publishChannel = null;
    this.connection = null;
  }
}

export const broker = new OrdersBroker();
