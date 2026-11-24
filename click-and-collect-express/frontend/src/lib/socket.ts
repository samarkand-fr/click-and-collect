// Connexion Socket.io unique partagée par toute l'application.
// Same-origin uniquement : en dev, Vite proxifie /socket.io vers la passerelle ;
// en production, Nginx fait le même relais vers http://gateway:8080.
import { io, type Socket } from 'socket.io-client';

export const socket: Socket = io('/', {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  randomizationFactor: 0.5,
  timeout: 10000,
});
