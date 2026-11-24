// =====================================================================
//  Broker RabbitMQ du notification-service (consommation seule).
//
//  Deux files :
//   - `notifications.order-status` ← order.status_updated
//     (exchange topic `cnc.orders.events`) — suivi cuisine / client.
//   - `notifications.catalog` ← catalog.product.*
//     (exchange topic `cnc.catalog.events`) — stock en direct de la carte.
//  Chacune dead-letter vers `cnc.notifications.dlx` (file .dlq dédiée).
//
//  La topologie est re-assertée à chaque (re)connexion : les services
//  peuvent démarrer dans n'importe quel ordre.
// =====================================================================
import {
  connect,
  type Channel,
  type ChannelModel,
  type ConsumeMessage,
} from 'amqplib';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import {
  CATALOG_EVENTS,
  ORDER_EVENTS,
  type EventEnvelope,
} from '../types/notification.types.js';

const RECONNECT_DELAY_MS = 5_000;

export type BrokerState = 'disabled' | 'connecting' | 'connected' | 'reconnecting';

export interface StatusUpdatedHandler {
  onOrderStatusUpdated(payload: unknown): Promise<void>;
  /** Callback des événements catalog.product.* (stock en direct). */
  onCatalogProductEvent(payload: unknown): Promise<void>;
}

class NotificationBroker {
  private connection: ChannelModel | null = null;
  private consumeChannel: Channel | null = null;
  private reconnecting = false;
  private closed = false;
  private handler: StatusUpdatedHandler | null = null;

  get isEnabled(): boolean {
    return config.rabbitmqUrl.length > 0;
  }

  /** État indicatif exposé par /health (ne fait pas échouer le healthcheck). */
  get state(): BrokerState {
    if (!this.isEnabled) return 'disabled';
    if (this.consumeChannel) return 'connected';
    return this.reconnecting ? 'reconnecting' : 'connecting';
  }

  /**
   * Démarre la connexion et la consommation. Le premier échec n'est pas
   * bloquant : le serveur HTTP + WebSocket démarre quand même
   * (reconnexion en arrière-plan).
   */
  async start(handler: StatusUpdatedHandler): Promise<void> {
    this.handler = handler;
    if (!this.isEnabled) {
      logger.warn(
        'RABBITMQ_URL absent — consommation order.status_updated désactivée (Socket.io reste opérationnel)',
      );
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
      this.consumeChannel = null;
      this.scheduleReconnect('connexion fermée');
    });

    const channel = await connection.createChannel();
    channel.on('error', (err) => logger.error({ err }, 'Canal de consommation en erreur'));
    channel.on('close', () => {
      this.consumeChannel = null;
    });

    await channel.assertExchange(config.ordersExchange, 'topic', { durable: true });
    await channel.assertExchange(config.catalogExchange, 'topic', { durable: true });
    await channel.assertExchange(config.notificationsDlx, 'topic', { durable: true });

    // ── File 1 : suivi des commandes ────────────────────────────────────────
    await channel.assertQueue(config.statusQueue, {
      durable: true,
      deadLetterExchange: config.notificationsDlx,
      deadLetterRoutingKey: config.statusDeadRoutingKey,
    });
    await channel.bindQueue(
      config.statusQueue,
      config.ordersExchange,
      ORDER_EVENTS.ORDER_STATUS_UPDATED,
    );

    // ── File 2 : stock en direct (catalog.product.*) ────────────────────────
    await channel.assertQueue(config.catalogQueue, {
      durable: true,
      deadLetterExchange: config.notificationsDlx,
      deadLetterRoutingKey: config.catalogDeadRoutingKey,
    });
    await channel.bindQueue(
      config.catalogQueue,
      config.catalogExchange,
      'catalog.product.*',
    );

    await channel.assertQueue(config.statusQueueDlq, { durable: true });
    await channel.bindQueue(
      config.statusQueueDlq,
      config.notificationsDlx,
      config.statusDeadRoutingKey,
    );

    await channel.assertQueue(config.catalogQueueDlq, { durable: true });
    await channel.bindQueue(
      config.catalogQueueDlq,
      config.notificationsDlx,
      config.catalogDeadRoutingKey,
    );

    // Diffusion temps réel : prefetch faible pour minimiser la latence.
    await channel.prefetch(10);
    await channel.consume(config.statusQueue, (msg) => void this.onMessage(channel, msg));
    await channel.consume(config.catalogQueue, (msg) => void this.onMessage(channel, msg));

    this.connection = connection;
    this.consumeChannel = channel;
    this.reconnecting = false;
    logger.info(
      {
        ordersExchange: config.ordersExchange,
        statusQueue: config.statusQueue,
        statusBinding: ORDER_EVENTS.ORDER_STATUS_UPDATED,
        catalogExchange: config.catalogExchange,
        catalogQueue: config.catalogQueue,
        catalogBinding: 'catalog.product.*',
      },
      'Broker RabbitMQ prêt (order.status_updated + catalog.product.*)',
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
      const event = JSON.parse(msg.content.toString('utf8')) as EventEnvelope;
      if (event?.payload === undefined) {
        throw new Error("Enveloppe d'événement invalide (payload absent)");
      }

      if (routingKey === ORDER_EVENTS.ORDER_STATUS_UPDATED) {
        await this.handler?.onOrderStatusUpdated(event.payload);
      } else if (
        routingKey === CATALOG_EVENTS.PRODUCT_CREATED ||
        routingKey === CATALOG_EVENTS.PRODUCT_UPDATED ||
        routingKey === CATALOG_EVENTS.PRODUCT_AVAILABILITY_CHANGED
      ) {
        await this.handler?.onCatalogProductEvent(event.payload);
      } else {
        logger.warn({ routingKey, messageId }, 'Événement non géré sur la file notifications — acquitté');
      }

      // Acquittement APRÈS diffusion : au pire, une redelivery après crash
      // re-diffuse une mise à jour (les écrans sont idempotents par statut).
      channel.ack(msg);
    } catch (err) {
      // Pas de requeue : éviter la boucle infinie de redelivery ;
      // l'événement part en DLQ pour inspection / rejeu manuel.
      logger.error({ err, routingKey, messageId }, "Traitement de l'événement en échec → dead-letter");
      channel.nack(msg, false, false);
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    try {
      await this.consumeChannel?.close();
      await this.connection?.close();
    } catch {
      // Le broker est peut-être déjà parti : rien à faire.
    }
    this.consumeChannel = null;
    this.connection = null;
  }
}

export const notificationBroker = new NotificationBroker();
