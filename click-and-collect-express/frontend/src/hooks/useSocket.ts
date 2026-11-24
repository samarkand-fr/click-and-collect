// Contexte temps réel global : connexion Socket.io unique, état "connecté" et gestion des rooms.
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { socket } from '../lib/socket';
import type { RoomJoinAck } from '../types';

interface SocketContextValue {
  connected: boolean;
  /** Rejoint une room (compteur de références pour les usages multiples). */
  joinRoom: (room: string) => void;
  /** Quitte une room (libère la référence). */
  leaveRoom: (room: string) => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

function joinRoomOnServer(room: string): void {
  socket.emit('room:join', room, (result: RoomJoinAck) => {
    if (!result.ok) {
      console.warn(`Impossible de rejoindre la room "${room}" : ${result.error ?? 'erreur inconnue'}`);
    }
  });
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState<boolean>(socket.connected);
  const roomCounts = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const handleConnect = () => {
      setConnected(true);
      // Après une (re)connexion, le serveur a oublié les rooms : il faut les re-joindre.
      roomCounts.current.forEach((_count, room) => joinRoomOnServer(room));
    };
    const handleDisconnect = () => setConnected(false);
    const handleConnectError = (error: Error) => {
      console.warn('[Socket.io] Tentative de connexion en attente du serveur...', error.message);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.connect();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.disconnect();
      roomCounts.current.clear();
    };
  }, []);

  const joinRoom = useCallback((room: string) => {
    const nextCount = (roomCounts.current.get(room) ?? 0) + 1;
    roomCounts.current.set(room, nextCount);
    // Si le socket n'est pas encore connecté, handleConnect re-joindra à la connexion.
    if (nextCount === 1 && socket.connected) {
      joinRoomOnServer(room);
    }
  }, []);

  const leaveRoom = useCallback((room: string) => {
    const nextCount = (roomCounts.current.get(room) ?? 0) - 1;
    if (nextCount > 0) {
      roomCounts.current.set(room, nextCount);
      return;
    }
    roomCounts.current.delete(room);
    if (socket.connected) {
      socket.emit('room:leave', room);
    }
  }, []);

  const value = useMemo<SocketContextValue>(
    () => ({ connected, joinRoom, leaveRoom }),
    [connected, joinRoom, leaveRoom],
  );

  // createElement (et non JSX) : ce fichier reste un module .ts pur.
  return createElement(SocketContext.Provider, { value }, children);
}

export function useSocket(): SocketContextValue {
  const contextValue = useContext(SocketContext);
  if (contextValue === null) {
    throw new Error("useSocket doit être utilisé à l'intérieur d'un SocketProvider.");
  }
  return contextValue;
}
