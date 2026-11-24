// =====================================================================
//  Publisher RabbitMQ — exchange topic `cnc.catalog.events`
//  Stratégie : best-effort résilient. Le service HTTP fonctionne même
//  si le broker est indisponible ; les événements non publiés sont loggués.
//  Routing key = type d'événement (ex : catalog.product.created).
// =====================================================================
import { randomUUID } from 'node:crypto';
import { connect, type ChannelModel, type ConfirmChannel } from 'amqplib';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import {
  CATALOG_EVENTS,
  type AvailabilityChangedPayload,
  type CatalogEvent,
  type CatalogEventType,
  type ProductCreatedPayload,
} from '../types/product.types.js';

const RECONNECT_DELAY_MS = 5_000;

class CatalogEventPublisher {
  private connection: ChannelModel | null = null;
  private channel: ConfirmChannel | null = null;
  private reconnecting = false;
  private closed = false;

  /** Le broker est optionnel : sans RABBITMQ_URL, le service tourne sans événements. */
  get isEnabled(): boolean {
    return config.rabbitmqUrl.length > 0;
  }

  /** Connexion en arrière-plan — ne bloque jamais le démarrage du serveur HTTP. */
  init(): void {
    if (!this.isEnabled) {
      logger.warn("RABBITMQ_URL absent — publication d'événements désactivée");
      return;
    }
    void this.connect();
  }

  private async connect(): Promise<void> {
    if (this.closed) return;

    try {
      const connection = await connect(config.rabbitmqUrl, { heartbeat: 15 });
      connection.on('error', (err) => logger.error({ err }, 'Connexion RabbitMQ en erreur'));
      connection.on('close', () => {
        this.channel = null;
        this.scheduleReconnect('connexion fermée');
      });

      const channel = await connection.createConfirmChannel();
      channel.on('error', (err) => logger.error({ err }, 'Canal RabbitMQ en erreur'));
      channel.on('close', () => {
        this.channel = null;
      });
      await channel.assertExchange(config.exchangeName, 'topic', { durable: true });

      this.connection = connection;
      this.channel = channel;
      this.reconnecting = false;
      logger.info({ exchange: config.exchangeName }, 'Connecté à RabbitMQ');
    } catch (err) {
      logger.warn({ err }, 'RabbitMQ indisponible — reconnexion programmée');
      this.scheduleReconnect('échec de connexion');
    }
  }

  private scheduleReconnect(reason: string): void {
    if (this.closed || this.reconnecting) return;
    this.reconnecting = true;
    logger.info({ reason, delayMs: RECONNECT_DELAY_MS }, 'Reconnexion RabbitMQ programmée');
    setTimeout(() => {
      this.reconnecting = false;
      void this.connect();
    }, RECONNECT_DELAY_MS).unref();
  }

  publish(eventType: CatalogEventType, payload: unknown): void {
    if (!this.channel) {
      logger.warn({ eventType }, 'Événement non publié (canal RabbitMQ indisponible)');
      return;
    }

    const event: CatalogEvent<unknown> = {
      eventId: randomUUID(),
      eventType,
      serviceName: 'catalog-service',
      occurredAt: new Date().toISOString(),
      payload,
    };

    this.channel.publish(
      config.exchangeName,
      eventType, // routing key = type d'événement (ex : catalog.product.created)
      Buffer.from(JSON.stringify(event), 'utf8'),
      {
        persistent: true,
        contentType: 'application/json',
        messageId: event.eventId,
        type: eventType,
      },
      (err) => {
        if (err) logger.error({ err, eventType }, 'Publication refusée par le broker (nack)');
      },
    );
  }

  productCreated(payload: ProductCreatedPayload): void {
    this.publish(CATALOG_EVENTS.PRODUCT_CREATED, payload);
  }

  availabilityChanged(payload: AvailabilityChangedPayload): void {
    this.publish(CATALOG_EVENTS.PRODUCT_AVAILABILITY_CHANGED, payload);
  }

  async close(): Promise<void> {
    this.closed = true;
    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch {
      // Le broker est peut-être déjà parti : rien à faire.
    }
    this.channel = null;
    this.connection = null;
  }
}

export const catalogEvents = new CatalogEventPublisher();
