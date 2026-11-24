// Panneau panier : lignes, quantités, total et passage de commande.
import { ArrowRight, Coffee, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { formatPrice } from '../lib/format';
import type { ResolvedCartLine } from '../types';

interface CartPanelProps {
  lines: ResolvedCartLine[];
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
  onRemove: (productId: string) => void;
  onCheckout: () => void;
  /** fourni uniquement dans la feuille mobile (bouton fermer). */
  onClose?: () => void;
  /** arrondis et hauteur max portés par l'appelant. */
  className?: string;
}

export default function CartPanel({
  lines,
  onIncrement,
  onDecrement,
  onRemove,
  onCheckout,
  onClose,
  className = '',
}: CartPanelProps) {
  const total = lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <section
      aria-label="Panier"
      className={`flex flex-col overflow-hidden border border-stone-200 bg-white shadow-soft ${className}`}
    >
      <header className="flex items-center gap-2 border-b border-stone-100 px-4 py-3">
        <ShoppingBag className="h-4 w-4 shrink-0 text-amber-600" />
        <h2 className="text-sm font-semibold text-stone-900">Votre commande</h2>
        <div className="ml-auto flex items-center gap-2">
          {itemCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {itemCount}
            </span>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer le panier"
              className="rounded-full p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </header>

      {lines.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
          <Coffee className="h-8 w-8 text-stone-300" />
          <p className="text-sm font-medium text-stone-500">Votre panier est vide</p>
          <p className="text-xs text-stone-400">Ajoutez des produits depuis la carte pour commencer.</p>
        </div>
      ) : (
        <>
          <ul className="min-h-0 flex-1 divide-y divide-stone-100 overflow-y-auto px-4">
            {lines.map(({ product, quantity }) => (
              <li key={product.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-stone-900">{product.name}</p>
                  <p className="text-xs text-stone-500">{formatPrice(product.price)} l'unité</p>
                  <div className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-stone-200 px-1 py-0.5">
                    <button
                      type="button"
                      onClick={() => onDecrement(product.id)}
                      aria-label={`Retirer un ${product.name}`}
                      className="rounded-full p-1 text-stone-500 transition hover:bg-stone-100 hover:text-stone-900"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-[1.5rem] text-center text-sm font-semibold text-stone-900">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => onIncrement(product.id)}
                      disabled={quantity >= product.stock}
                      aria-label={`Ajouter un ${product.name}`}
                      className="rounded-full p-1 text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="text-sm font-semibold text-stone-900">
                    {formatPrice(product.price * quantity)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(product.id)}
                    aria-label={`Supprimer ${product.name} du panier`}
                    className="rounded-full p-1 text-stone-400 transition hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <footer className="border-t border-stone-100 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-stone-500">Total</span>
              <span className="text-base font-bold text-stone-900">{formatPrice(total)}</span>
            </div>
            <button
              type="button"
              onClick={onCheckout}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-amber-700 active:scale-[0.99]"
            >
              Passer la commande
              <ArrowRight className="h-4 w-4" />
            </button>
          </footer>
        </>
      )}
    </section>
  );
}
