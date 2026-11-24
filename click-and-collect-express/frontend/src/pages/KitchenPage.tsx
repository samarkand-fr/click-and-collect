// Page cuisine : kanban des commandes payées, en préparation et prêtes au retrait.
import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChefHat,
  Clock,
  RefreshCw,
  ShoppingBag,
  User,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useKitchenOrders } from '../hooks/useKitchenOrders';
import { formatPrice, formatRelativeTime } from '../lib/format';
import type { Order, OrderStatus } from '../types';

interface KitchenColumnProps {
  title: string;
  icon: LucideIcon;
  accentClass: string;
  orders: Order[];
  flashIds: string[];
  now: number;
  onStart: (order: Order) => void;
  onReady: (order: Order) => void;
  onDismiss: (order: Order) => void;
}

interface KitchenOrderCardProps {
  order: Order;
  isFlashing: boolean;
  now: number;
  onStart: (order: Order) => void;
  onReady: (order: Order) => void;
  onDismiss: (order: Order) => void;
}

function KitchenOrderCard({ order, isFlashing, now, onStart, onReady, onDismiss }: KitchenOrderCardProps) {
  // Les items peuvent être absents si la commande n'est arrivée que par le socket.
  const itemsSummary = order.items.map((item) => `${item.name} ×${item.quantity}`).join(', ');

  return (
    <article
      className={`rounded-xl border bg-white p-3.5 shadow-soft transition ${
        isFlashing ? 'animate-flash border-amber-300' : 'border-stone-200'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-stone-900">
            <User className="h-4 w-4 shrink-0 text-amber-600" />
            <span className="truncate">{order.customerName}</span>
          </p>
          <p className="mt-0.5 font-mono text-xs text-stone-400">#{order.id.slice(0, 8)}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-xs text-stone-500">
          <Clock className="h-3.5 w-3.5" />
          {formatRelativeTime(order.createdAt, now)}
        </span>
      </div>

      <p className="mt-2 min-h-[1.25rem] text-sm leading-snug text-stone-600">
        {itemsSummary !== '' ? itemsSummary : 'Détails produits en cours de synchronisation…'}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-stone-100 pt-3">
        <span className="text-sm font-bold text-stone-900">{formatPrice(order.totalAmount)}</span>
        {order.status === 'PAID' && (
          <button
            type="button"
            onClick={() => onStart(order)}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-amber-700"
          >
            Démarrer la préparation
          </button>
        )}
        {order.status === 'PREPARING' && (
          <button
            type="button"
            onClick={() => onReady(order)}
            className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-orange-600"
          >
            Marquer prête
          </button>
        )}
        {order.status === 'READY' && (
          <button
            type="button"
            onClick={() => onDismiss(order)}
            className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 transition hover:bg-stone-100"
          >
            Retirer de l'affichage
          </button>
        )}
      </div>
    </article>
  );
}

function KitchenColumn({
  title,
  icon: Icon,
  accentClass,
  orders,
  flashIds,
  now,
  onStart,
  onReady,
  onDismiss,
}: KitchenColumnProps) {
  return (
    <section className="flex flex-col rounded-2xl border border-stone-200 bg-stone-100/70 p-3">
      <header className="mb-3 flex items-center gap-2 px-1">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${accentClass}`}>
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="text-sm font-bold text-stone-800">{title}</h2>
        <span className="ml-auto rounded-full border border-stone-200 bg-white px-2 py-0.5 text-xs font-semibold text-stone-600">
          {orders.length}
        </span>
      </header>

      {orders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white/60 px-3 py-10 text-center text-sm text-stone-400">
          Aucune commande
        </p>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <KitchenOrderCard
              key={order.id}
              order={order}
              isFlashing={flashIds.includes(order.id)}
              now={now}
              onStart={onStart}
              onReady={onReady}
              onDismiss={onDismiss}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function KitchenPage() {
  const {
    paidOrders,
    preparingOrders,
    readyOrders,
    loading,
    error,
    actionError,
    flashIds,
    refresh,
    startPreparation,
    markReady,
    dismissOrder,
    clearActionError,
  } = useKitchenOrders();

  // Horloge rafraîchie toutes les 30 s pour les temps relatifs.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const columns: Array<{ key: OrderStatus; title: string; icon: LucideIcon; accentClass: string; orders: Order[] }> = [
    { key: 'PAID', title: 'Payées / À faire', icon: ShoppingBag, accentClass: 'bg-amber-100 text-amber-800', orders: paidOrders },
    { key: 'PREPARING', title: 'En préparation', icon: ChefHat, accentClass: 'bg-orange-100 text-orange-800', orders: preparingOrders },
    { key: 'READY', title: 'Prêtes au retrait', icon: CheckCircle2, accentClass: 'bg-emerald-100 text-emerald-800', orders: readyOrders },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 sm:text-3xl">Cuisine</h1>
          <p className="mt-1 text-sm text-stone-500">Suivi des commandes en temps réel, colonne par colonne.</p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium text-stone-700 shadow-soft transition hover:bg-stone-50"
        >
          <RefreshCw className="h-4 w-4" />
          Actualiser
        </button>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-stone-500">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        Les commandes en attente de paiement n'apparaissent pas encore dans le flux cuisine.
      </p>

      {error !== null && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </span>
          <button
            type="button"
            onClick={refresh}
            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
          >
            Réessayer
          </button>
        </div>
      )}

      {actionError !== null && (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          <span className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {actionError}
          </span>
          <button
            type="button"
            onClick={clearActionError}
            aria-label="Fermer le message d'erreur"
            className="rounded-full p-1 transition hover:bg-orange-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="mt-6 grid items-start gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="animate-pulse rounded-2xl border border-stone-200 bg-stone-100 p-4">
              <div className="h-8 w-1/2 rounded bg-stone-200" />
              <div className="mt-4 space-y-3">
                <div className="h-24 rounded-xl bg-stone-200/80" />
                <div className="h-24 rounded-xl bg-stone-200/60" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 grid items-start gap-4 lg:grid-cols-3">
          {columns.map((column) => (
            <KitchenColumn
              key={column.key}
              title={column.title}
              icon={column.icon}
              accentClass={column.accentClass}
              orders={column.orders}
              flashIds={flashIds}
              now={now}
              onStart={(order) => void startPreparation(order)}
              onReady={(order) => void markReady(order)}
              onDismiss={(order) => dismissOrder(order.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
