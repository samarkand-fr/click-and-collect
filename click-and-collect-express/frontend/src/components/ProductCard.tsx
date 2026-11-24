// Carte produit de la carte : visuel, prix, stock et ajout au panier.
import { Minus, Plus } from 'lucide-react';
import { formatPrice } from '../lib/format';
import type { Product } from '../types';

interface ProductCardProps {
  product: Product;
  /** Quantité actuellement dans le panier (0 si absente). */
  quantityInCart: number;
  onAdd: (product: Product) => void;
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
}

export default function ProductCard({
  product,
  quantityInCart,
  onAdd,
  onIncrement,
  onDecrement,
}: ProductCardProps) {
  const soldOut = !product.isAvailable || product.stock === 0;
  const canAddMore = quantityInCart < product.stock;
  const initials = product.name.slice(0, 2).toUpperCase();

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-soft transition hover:shadow-md ${
        soldOut ? 'opacity-60' : ''
      }`}
    >
      <div className="relative h-36 w-full overflow-hidden bg-stone-100">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            className={`h-full w-full object-cover transition duration-300 ${
              soldOut ? 'grayscale' : 'hover:scale-105'
            }`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-lg font-bold text-amber-700">
              {initials}
            </span>
          </div>
        )}
        {soldOut && (
          <span className="absolute inset-x-0 bottom-0 bg-stone-900/75 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-white">
            Épuisé
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-stone-900">{product.name}</h3>
          <span className="shrink-0 text-sm font-bold text-amber-700">{formatPrice(product.price)}</span>
        </div>

        {product.description && (
          <p className="line-clamp-2 text-xs leading-relaxed text-stone-500">{product.description}</p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              product.stock === 0
                ? 'bg-red-100 text-red-700'
                : product.stock <= 3
                  ? 'bg-orange-100 text-orange-700'
                  : 'bg-stone-100 text-stone-600'
            }`}
          >
            {product.stock === 0 ? 'Rupture de stock' : `Stock : ${product.stock}`}
          </span>

          {quantityInCart === 0 ? (
            <button
              type="button"
              onClick={() => onAdd(product)}
              disabled={soldOut}
              className="flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500"
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter
            </button>
          ) : (
            <div className="flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-1 py-0.5">
              <button
                type="button"
                onClick={() => onDecrement(product.id)}
                aria-label={`Retirer un ${product.name}`}
                className="rounded p-1 text-amber-800 transition hover:bg-amber-100"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[1.25rem] text-center text-sm font-bold text-amber-900">
                {quantityInCart}
              </span>
              <button
                type="button"
                onClick={() => onIncrement(product.id)}
                disabled={!canAddMore}
                aria-label={`Ajouter un ${product.name}`}
                className="rounded p-1 text-amber-800 transition hover:bg-amber-100 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
