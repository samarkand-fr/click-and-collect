// Page de suivi client : progression, statut temps réel et récapitulatif.
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Clock, Coffee, Euro, Loader2, User } from 'lucide-react';
import ProgressBar from '../components/ProgressBar';
import StatusBadge from '../components/StatusBadge';
import { useOrderTracking } from '../hooks/useOrderTracking';
import { formatDateTime, formatPrice } from '../lib/format';

export default function TrackingPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id ?? '';
  const { order, loading, notFound, error, retry } = useOrderTracking(orderId);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-24">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
        <p className="text-sm text-stone-500">Chargement de la commande…</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center gap-4 px-4 py-24 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-stone-100">
          <Coffee className="h-8 w-8 text-stone-400" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-stone-900">Commande introuvable</h1>
          <p className="mt-1 text-sm text-stone-500">
            Cette commande n'existe pas ou a été supprimée. Vérifiez le lien de suivi reçu lors de la commande.
          </p>
        </div>
        <Link
          to="/"
          className="flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-amber-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à la carte
        </Link>
      </div>
    );
  }

  if (error !== null) {
    return (
      <div className="flex flex-col items-center gap-4 px-4 py-24 text-center">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-sm text-stone-600">{error}</p>
        <button
          type="button"
          onClick={retry}
          className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-amber-700"
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center gap-4 px-4 py-24 text-center">
        <Coffee className="h-10 w-10 text-stone-300" />
        <p className="text-sm text-stone-500">Commande introuvable.</p>
        <Link
          to="/"
          className="flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-amber-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à la carte
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-500 transition hover:text-amber-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour à la carte
      </Link>

      <section className="mt-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-stone-900">Suivi de commande</h1>
            <p className="mt-0.5 font-mono text-xs text-stone-400">#{order.id.slice(0, 8)}</p>
          </div>
          <StatusBadge status={order.status} />
        </div>

        <div className="mt-6">
          <ProgressBar status={order.status} />
        </div>

        {order.status === 'PENDING' && (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-600" />
            Paiement en cours de traitement…
          </div>
        )}

        {order.status === 'CANCELLED' && (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Paiement refusé — commande annulée
          </div>
        )}
      </section>

      <section className="mt-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-soft">
        <h2 className="text-sm font-semibold text-stone-900">Détail de la commande</h2>

        <p className="mt-2 flex items-center gap-1.5 text-sm text-stone-700">
          <User className="h-4 w-4 shrink-0 text-amber-600" />
          Client : <span className="font-medium">{order.customerName}</span>
        </p>

        <ul className="mt-3 divide-y divide-stone-100 border-y border-stone-100">
          {order.items.length === 0 ? (
            <li className="py-2.5 text-sm text-stone-400">Détail des articles indisponible.</li>
          ) : (
            order.items.map((item) => (
              <li key={item.productId} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0 text-stone-700">
                  {item.name} <span className="text-stone-400">×{item.quantity}</span>
                </span>
                <span className="shrink-0 font-medium text-stone-900">{formatPrice(item.subtotal)}</span>
              </li>
            ))
          )}
        </ul>

        <div className="mt-3 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-stone-700">
            <Euro className="h-4 w-4 text-amber-600" />
            Total
          </span>
          <span className="text-lg font-bold text-stone-900">{formatPrice(order.totalAmount)}</span>
        </div>

        <div className="mt-4 space-y-1.5 border-t border-stone-100 pt-3 text-xs text-stone-400">
          <p className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Commandée le {formatDateTime(order.createdAt)}
          </p>
          <p className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Dernière mise à jour : {formatDateTime(order.updatedAt)}
          </p>
        </div>
      </section>
    </div>
  );
}
