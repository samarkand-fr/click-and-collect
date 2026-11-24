// =====================================================================
//  Client Socket.io de test — vérifie les rooms et la diffusion.
//
//  Usage :
//    npm run client:test --workspace @cnc/notification-service
//    npm run client:test --workspace @cnc/notification-service -- http://127.0.0.1:3004 demo-123
//
//  Le client :
//    1. se connecte au serveur Socket.io,
//    2. rejoint `kitchen`, `order_<orderId>` puis tente une room interdite
//       (doit être refusée par le garde-fou serveur),
//    3. affiche tous les `order.status_updated` reçus.
//
//  AUTO_EXIT_MS (défaut : 8000) déconnecte automatiquement ;
//  AUTO_EXIT_MS=0 reste connecté jusqu'à Ctrl-C.
// =====================================================================
import { io } from 'socket.io-client';

const url = process.argv[2] ?? 'http://127.0.0.1:3004';
const orderId = process.argv[3] ?? `demo-${Date.now()}`;
const AUTO_EXIT_MS = Number(process.env.AUTO_EXIT_MS ?? 8000);

interface JoinResult {
  ok: boolean;
  room?: string;
  clients?: number;
  error?: string;
}

const socket = io(url, { transports: ['websocket', 'polling'] });

const pretty = (label: string, data: unknown): void => {
  console.log(`\n[${new Date().toISOString()}] ${label}`);
  console.log(JSON.stringify(data, null, 2));
};

socket.on('connect', () => {
  console.log(`Connecté à ${url} (socket ${socket.id})`);

  socket.emit('room:join', 'kitchen', (result: JoinResult) => {
    console.log(`room:join kitchen → ${JSON.stringify(result)}`);
  });
  socket.emit('room:join', `order_${orderId}`, (result: JoinResult) => {
    console.log(`room:join order_${orderId} → ${JSON.stringify(result)}`);
  });
  socket.emit('room:join', 'admin', (result: JoinResult) => {
    console.log(`room:join admin (doit être refusée) → ${JSON.stringify(result)}`);
  });
});

socket.on('notification.welcome', (data: unknown) => pretty('notification.welcome', data));
socket.on('room:joined', (data: unknown) => pretty('room:joined', data));
socket.on('order.status_updated', (data: unknown) => pretty('order.status_updated', data));
socket.on('disconnect', (reason: string) => console.log(`Déconnecté : ${reason}`));
socket.on('connect_error', (err: Error) => console.error(`Erreur de connexion : ${err.message}`));

if (AUTO_EXIT_MS > 0) {
  setTimeout(() => {
    console.log(`\nFin du test (${AUTO_EXIT_MS} ms) — déconnexion.`);
    socket.disconnect();
    process.exit(0);
  }, AUTO_EXIT_MS);
}
