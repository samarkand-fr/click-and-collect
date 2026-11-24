// Hook vue cuisine : commandes à traiter, rooms temps réel et transitions optimistes.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchOrders, updateOrderStatus } from '../lib/api';
import { socket } from '../lib/socket';
import { useSocket } from './useSocket';
import type { Order, OrderStatus, OrderStatusUpdatedEvent } from '../types';

export interface UseKitchenOrdersResult {
  paidOrders: Order[];
  preparingOrders: Order[];
  readyOrders: Order[];
  loading: boolean;
  error: string | null;
  actionError: string | null;
  /** Commandes récemment arrivées en colonne 1 (animation flash ambrée). */
  flashIds: string[];
  refresh: () => void;
  startPreparation: (order: Order) => Promise<void>;
  markReady: (order: Order) => Promise<void>;
  dismissOrder: (orderId: string) => void;
  clearActionError: () => void;
}

/** Statuts affichés dans le kanban cuisine — les PENDING (paiement en cours) sont exclus. */
const DISPLAYED_STATUSES: OrderStatus[] = ['PAID', 'PREPARING', 'READY'];

function sortByOldestFirst(a: Order, b: Order): number {
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

function listByStatus(orders: Map<string, Order>, status: OrderStatus): Order[] {
  return [...orders.values()].filter((order) => order.status === status).sort(sortByOldestFirst);
}

export function useKitchenOrders(): UseKitchenOrdersResult {
  const { joinRoom, leaveRoom } = useSocket();
  const [orders, setOrders] = useState<Map<string, Order>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [flashIds, setFlashIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const allOrders = await fetchOrders();
      const displayed = allOrders.filter((order) => DISPLAYED_STATUSES.includes(order.status));
      setOrders(new Map(displayed.map((order): [string, Order] => [order.id, order])));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les commandes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    joinRoom('kitchen');
    return () => leaveRoom('kitchen');
  }, [joinRoom, leaveRoom]);

  // Écoute temps réel : insertion / mise à jour / retrait des commandes du kanban.
  useEffect(() => {
    const onStatusUpdated = (payload: OrderStatusUpdatedEvent) => {
      if (payload.status === 'PENDING') return; // paiement en cours : pas affiché

      if (payload.status === 'CANCELLED') {
        setOrders((previous) => {
          if (!previous.has(payload.orderId)) return previous;
          const next = new Map(previous);
          next.delete(payload.orderId);
          return next;
        });
        return;
      }

      setOrders((previous) => {
        const existing = previous.get(payload.orderId);
        const next = new Map(previous);
        if (existing) {
          next.set(payload.orderId, {
            ...existing,
            customerName: payload.customerName,
            status: payload.status,
            totalAmount: payload.totalAmount,
            updatedAt: payload.occurredAt,
          });
        } else {
          // Commande inconnue : le payload ne transporte pas les items.
          next.set(payload.orderId, {
            id: payload.orderId,
            customerName: payload.customerName,
            items: [],
            totalAmount: payload.totalAmount,
            status: payload.status,
            createdAt: payload.occurredAt,
            updatedAt: payload.occurredAt,
          });
        }
        return next;
      });

      // Nouvelle commande qui entre en colonne 1 : flash ambré éphémère.
      if (payload.previousStatus === 'PENDING' && payload.status === 'PAID') {
        setFlashIds((previous) =>
          previous.includes(payload.orderId) ? previous : [...previous, payload.orderId],
        );
        window.setTimeout(() => {
          setFlashIds((previous) => previous.filter((id) => id !== payload.orderId));
        }, 2600);
      }
    };

    socket.on('order.status_updated', onStatusUpdated);
    return () => {
      socket.off('order.status_updated', onStatusUpdated);
    };
  }, []);

  const paidOrders = useMemo(() => listByStatus(orders, 'PAID'), [orders]);
  const preparingOrders = useMemo(() => listByStatus(orders, 'PREPARING'), [orders]);
  const readyOrders = useMemo(() => listByStatus(orders, 'READY'), [orders]);

  // Transition optimiste : mise à jour immédiate, retour arrière si l'API échoue.
  const changeStatus = useCallback(
    async (order: Order, target: Extract<OrderStatus, 'PREPARING' | 'READY'>) => {
      const previousStatus = order.status;
      setOrders((previous) => {
        const existing = previous.get(order.id);
        if (!existing) return previous;
        const next = new Map(previous);
        next.set(order.id, { ...existing, status: target });
        return next;
      });
      try {
        await updateOrderStatus(order.id, target);
      } catch (err) {
        setOrders((previous) => {
          const existing = previous.get(order.id);
          if (!existing) return previous;
          const next = new Map(previous);
          next.set(order.id, { ...existing, status: previousStatus });
          return next;
        });
        setActionError(
          err instanceof Error
            ? `Échec de la mise à jour : ${err.message}`
            : 'Échec de la mise à jour de la commande.',
        );
      }
    },
    [],
  );

  const startPreparation = useCallback((order: Order) => changeStatus(order, 'PREPARING'), [changeStatus]);
  const markReady = useCallback((order: Order) => changeStatus(order, 'READY'), [changeStatus]);

  const dismissOrder = useCallback((orderId: string) => {
    setOrders((previous) => {
      if (!previous.has(orderId)) return previous;
      const next = new Map(previous);
      next.delete(orderId);
      return next;
    });
  }, []);

  const clearActionError = useCallback(() => setActionError(null), []);

  return {
    paidOrders,
    preparingOrders,
    readyOrders,
    loading,
    error,
    actionError,
    flashIds,
    refresh: load,
    startPreparation,
    markReady,
    dismissOrder,
    clearActionError,
  };
}
