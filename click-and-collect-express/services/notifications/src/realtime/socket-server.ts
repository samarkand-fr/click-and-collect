// =====================================================================
//  Hub temps réel — serveur Socket.io attaché au serveur HTTP.
//
//  Chaque order.status_updated est diffusé sur DEUX canaux :
//    - room globale `kitchen`   : écran de cuisine (toutes les commandes)
//    - room `order_<orderId>`   : suivi client d'une commande précise
//
//  Contrat client ⇄ serveur :
//    - client → 'room:join' (room, ack)   → { ok, room?, clients? | error }
//    - client → 'room:leave' (room)
//    - serveur → 'notification.welcome'   (capabilities, à la connexion)
//    - serveur → 'room:joined'            (confirmation)
//    - serveur → 'order.status_updated'   (payload, sur les 2 rooms)
//
//  Un client dans les deux rooms reçoit l'événement deux fois : les
//  écrans se spécialisent (cuisine → kitchen, client → order_<id>).
// =====================================================================
import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import {
  KITCHEN_ROOM,
  SOCKET_EVENTS,
  isAllowedRoom,
  orderRoom,
  type CatalogProductEventPayload,
  type OrderStatusUpdatedPayload,
} from '../types/notification.types.js';

export interface BroadcastResult {
  /** Nombre de clients dans la room `kitchen`. */
  kitchenClients: number;
  /** Nombre de clients dans la room `order_<orderId>`. */
  orderRoomClients: number;
}

class RealtimeHub {
  private io: Server | null = null;

  /** Attache Socket.io au serveur HTTP (WebSocket + polling fallback). */
  init(httpServer: HttpServer): void {
    this.io = new Server(httpServer, {
      // '*' → reflète l'origine du client (dev) ; sinon liste CORS explicite.
      cors: {
        origin:
          config.corsOrigin === '*'
            ? true
            : config.corsOrigin.split(',').map((origin) => origin.trim()),
        methods: ['GET', 'POST'],
      },
    });

    this.io.on('connection', (socket: Socket) => {
      logger.info({ socketId: socket.id }, 'Client WebSocket connecté');

      socket.emit(SOCKET_EVENTS.WELCOME, {
        message: 'Connecté à notification-service',
        rooms: ['kitchen', 'order_<orderId>'],
        events: [SOCKET_EVENTS.STATUS_UPDATED],
        connectedAt: new Date().toISOString(),
      });

      socket.on(SOCKET_EVENTS.ROOM_JOIN, (rawRoom: unknown, ack?: (result: unknown) => void) => {
        const room = typeof rawRoom === 'string' ? rawRoom.trim() : '';
        if (!isAllowedRoom(room)) {
          const error = `Room non autorisée : "${room || '(vide)'}" — attendu 'kitchen' ou 'order_<orderId>'`;
          logger.warn({ socketId: socket.id, room }, error);
          ack?.({ ok: false, error });
          return;
        }
        void socket.join(room);
        logger.info({ socketId: socket.id, room }, 'Client a rejoint une room');
        ack?.({ ok: true, room, clients: this.roomSize(room) });
        socket.emit(SOCKET_EVENTS.ROOM_JOINED, { room });
      });

      socket.on(SOCKET_EVENTS.ROOM_LEAVE, (rawRoom: unknown) => {
        const room = typeof rawRoom === 'string' ? rawRoom.trim() : '';
        if (isAllowedRoom(room)) {
          void socket.leave(room);
          logger.info({ socketId: socket.id, room }, 'Client a quitté une room');
        }
      });

      socket.on('disconnect', (reason: string) => {
        logger.info({ socketId: socket.id, reason }, 'Client WebSocket déconnecté');
      });
    });
  }

  /** Taille d'une room (0 si l'adapter n'est pas prêt). */
  private roomSize(room: string): number {
    return this.io?.of('/').adapter.rooms.get(room)?.size ?? 0;
  }

  /** Nombre de sockets connectés (diagnostic /health, /realtime/stats). */
  get connectedSockets(): number {
    return this.io?.engine.clientsCount ?? 0;
  }

  /** Snapshot des rooms métier (exclut les rooms internes par socket id). */
  roomsSnapshot(): Array<{ name: string; clients: number }> {
    const rooms = this.io?.of('/').adapter.rooms;
    if (!rooms) return [];
    return [...rooms.entries()]
      .filter(([name]) => isAllowedRoom(name))
      .map(([name, sockets]) => ({ name, clients: sockets.size }));
  }

  /**
   * Diffuse une mise à jour de statut aux DEUX canaux :
   * la room globale cuisine et la room dédiée à la commande.
   */
  broadcastStatusUpdate(payload: OrderStatusUpdatedPayload): BroadcastResult {
    if (!this.io) {
      logger.warn({ orderId: payload.orderId }, 'Diffusion impossible (Socket.io non initialisé)');
      return { kitchenClients: 0, orderRoomClients: 0 };
    }

    const room = orderRoom(payload.orderId);
    this.io.to(KITCHEN_ROOM).emit(SOCKET_EVENTS.STATUS_UPDATED, payload);
    this.io.to(room).emit(SOCKET_EVENTS.STATUS_UPDATED, payload);

    const result: BroadcastResult = {
      kitchenClients: this.roomSize(KITCHEN_ROOM),
      orderRoomClients: this.roomSize(room),
    };
    logger.info(
      {
        orderId: payload.orderId,
        status: payload.status,
        previousStatus: payload.previousStatus,
        kitchen: result.kitchenClients,
        customer: result.orderRoomClients,
      },
      'Mise à jour diffusée (WebSocket)',
    );
    return result;
  }

  /**
   * Diffuse une mise à jour de STOCK à TOUS les clients connectés
   * (écran client + écran cuisine) — la carte est une donnée publique.
   * Événement Socket.io : `catalog.product.updated`.
   */
  broadcastCatalogUpdate(payload: CatalogProductEventPayload): void {
    if (!this.io) {
      logger.warn(
        { productId: payload.productId },
        'Diffusion du stock impossible (Socket.io non initialisé)',
      );
      return;
    }
    this.io.emit(SOCKET_EVENTS.PRODUCT_UPDATED, payload);
    logger.debug(
      { productId: payload.productId, stock: payload.stock, clients: this.connectedSockets },
      'Stock en direct diffusé (WebSocket)',
    );
  }

  /** Ferme toutes les connexions puis libère le serveur sous-jacent. */
  async close(): Promise<void> {
    if (!this.io) return;
    await new Promise<void>((resolve) => {
      this.io?.close(() => resolve());
    });
    this.io = null;
  }
}

export const realtimeHub = new RealtimeHub();
