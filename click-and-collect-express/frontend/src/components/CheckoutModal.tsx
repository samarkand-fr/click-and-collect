// Modale de finalisation : prénom du client, récapitulatif et envoi de la commande.
import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { formatPrice } from '../lib/format';
import type { ResolvedCartLine } from '../types';

interface CheckoutModalProps {
  open: boolean;
  lines: ResolvedCartLine[];
  onClose: () => void;
  /** Envoie la commande ; en cas d'échec, lève une erreur (message  affiché). */
  onConfirm: (customerName: string) => Promise<void>;
}

export default function CheckoutModal({ open, lines, onClose, onConfirm }: CheckoutModalProps) {
  const [customerName, setCustomerName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Réinitialise l'erreur à chaque ouverture.
  useEffect(() => {
    if (open) setErrorMessage(null);
  }, [open]);

  // Fermeture au clavier (Échap), sauf pendant l'envoi.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const total = lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const trimmedName = customerName.trim();
    if (trimmedName.length === 0) {
      setErrorMessage('Veuillez indiquer votre prénom.');
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await onConfirm(trimmedName);
      // Succès : le parent vide le panier et redirige vers le suivi.
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Une erreur inattendue est survenue.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/60 sm:items-center sm:p-4"
      onClick={submitting ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Finaliser la commande"
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-stone-900">Finaliser la commande</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Fermer"
            className="rounded-full p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="customer-name" className="text-sm font-medium text-stone-700">
              Votre prénom
            </label>
            <input
              id="customer-name"
              type="text"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              maxLength={100}
              required
              autoFocus
              placeholder="Exemple : Camille"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
            />
            <p className="mt-1 text-xs text-stone-400">Affiché au comptoir pour retrouver votre commande.</p>
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Récapitulatif</p>
            <ul className="mt-2 space-y-1.5">
              {lines.map(({ product, quantity }) => (
                <li key={product.id} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-stone-700">
                    {product.name} <span className="text-stone-400">×{quantity}</span>
                  </span>
                  <span className="shrink-0 font-medium text-stone-900">
                    {formatPrice(product.price * quantity)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between border-t border-stone-200 pt-2">
              <span className="text-sm font-semibold text-stone-700">Total</span>
              <span className="text-base font-bold text-stone-900">{formatPrice(total)}</span>
            </div>
          </div>

          {errorMessage && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || lines.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Envoi en cours…
              </>
            ) : (
              'Confirmer la commande'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
