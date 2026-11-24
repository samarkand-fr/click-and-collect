// Hook suivi de commande : chargement REST + écoute des mises à jour de statut.
import { useCallback, useEffect, useState } from 'react';
import { ApiRequestError, fetchOrderById } from '../lib/api';
import { socket } from '../lib/socket';
import { useSocket } from './useSocket';
import type { Order, OrderStatusUpdatedEvent } from '../types';

export interface UseOrderTrackingResult {
  order: Order | null;
  loading: boolean;
  notFound: boolean;
  error: string | null;
  retry: () => void;
}

export function useOrderTracking(orderId: string): UseOrderTrackingResult {
  const { joinRoom, leaveRoom } = useSocket();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Chargement + abonnement à la room dédiée à la commande.
  useEffect(() => {
    if (orderId === '') {
      setOrder(null);
      setLoading(false);
      setNotFound(true);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setError(null);
    setOrder(null);

    const room = `order_${orderId}`;
    joinRoom(room);

    fetchOrderById(orderId)
      .then((data) => {
        if (!cancelled) setOrder(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiRequestError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(err instanceof Error ? err.message : 'Impossible de charger la commande.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      leaveRoom(room);
    };
  }, [orderId, reloadToken, joinRoom, leaveRoom]);

  // Temps réel : met à jour le statut local quand un événement concerne CETTE commande.
  useEffect(() => {
    const onStatusUpdated = (payload: OrderStatusUpdatedEvent) => {
      if (payload.orderId !== orderId) return;
      setOrder((previous) =>
        previous
          ? {
              ...previous,
              status: payload.status,
              totalAmount: payload.totalAmount,
              updatedAt: payload.occurredAt,
            }
          : previous,
      );
    };
    socket.on('order.status_updated', onStatusUpdated);
    return () => {
      socket.off('order.status_updated', onStatusUpdated);
    };
  }, [orderId]);

  const retry = useCallback(() => setReloadToken((token) => token + 1), []);

  return { order, loading, notFound, error, retry };
}
