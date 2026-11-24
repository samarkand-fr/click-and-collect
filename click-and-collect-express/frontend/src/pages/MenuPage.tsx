// Page client : carte des produits, panier temps réel et passage de commande.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Coffee,
  Cookie,
  Croissant,
  CupSoda,
  Sandwich,
  ShoppingBag,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import CartPanel from '../components/CartPanel';
import CheckoutModal from '../components/CheckoutModal';
import ProductCard from '../components/ProductCard';
import { useProducts } from '../hooks/useProducts';
import { createOrder } from '../lib/api';
import { formatPrice } from '../lib/format';
import type { CartLine, Product, ResolvedCartLine } from '../types';

interface StockWarning {
  id: number;
  message: string;
}

// Noms d'affichage par catégorie (gère à la fois les clés seed et FR).
const CATEGORY_LABELS: Record<string, string> = {
  coffee: 'Cafés & Spécialités',
  food: 'Restauration & Salé',
  dessert: 'Pâtisseries & Desserts',
  drinks: 'Boissons Fraîches',
  snack: 'Snacks & Encas',
  Café: 'Cafés & Spécialités',
  Boisson: 'Boissons Fraîches',
  Pâtisserie: 'Pâtisseries & Desserts',
  Snack: 'Snacks & Encas',
  Sandwich: 'Sandwiches',
};

// Icônes par catégorie connue (Utensils par défaut).
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  coffee: Coffee,
  food: Sandwich,
  dessert: Croissant,
  drinks: CupSoda,
  snack: Cookie,
  Café: Coffee,
  Boisson: CupSoda,
  Pâtisserie: Croissant,
  Snack: Cookie,
  Sandwich: Sandwich,
};

const SKELETON_COUNT = 6;

export default function MenuPage() {
  const navigate = useNavigate();
  const { products, loading, error, retry } = useProducts();

  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [warnings, setWarnings] = useState<StockWarning[]>([]);
  const warningIdRef = useRef(0);

  const productMap = useMemo(
    () => new Map(products.map((product): [string, Product] => [product.id, product])),
    [products],
  );

  const pushWarning = useCallback((message: string) => {
    warningIdRef.current += 1;
    const id = warningIdRef.current;
    setWarnings((previous) => [...previous, { id, message }]);
    window.setTimeout(() => {
      setWarnings((previous) => previous.filter((warning) => warning.id !== id));
    }, 4000);
  }, []);

  // Stock temps réel : si une ligne dépasse le stock restant, on bride la quantité
  // (ou on retire la ligne) et on affiche un avertissement éphémère.
  useEffect(() => {
    const nextLines: CartLine[] = [];
    let changed = false;
    for (const line of cart) {
      const product = productMap.get(line.productId);
      if (!product) {
        changed = true;
        continue;
      }
      const maxQuantity = product.isAvailable ? product.stock : 0;
      if (line.quantity > maxQuantity) {
        changed = true;
        if (maxQuantity > 0) {
          nextLines.push({ ...line, quantity: maxQuantity });
          pushWarning(`Stock réduit pour ${product.name}`);
        } else {
          pushWarning(`${product.name} est en rupture de stock et a été retiré du panier`);
        }
      } else {
        nextLines.push(line);
      }
    }
    if (changed) setCart(nextLines);
  }, [cart, productMap, pushWarning]);

  const addToCart = useCallback((product: Product) => {
    setCart((previous) => {
      const existing = previous.find((line) => line.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return previous;
        return previous.map((line) =>
          line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      if (product.stock <= 0) return previous;
      return [...previous, { productId: product.id, quantity: 1 }];
    });
  }, []);

  const incrementQuantity = useCallback(
    (productId: string) => {
      setCart((previous) =>
        previous.map((line) => {
          if (line.productId !== productId) return line;
          const product = productMap.get(productId);
          if (!product || line.quantity >= product.stock) return line;
          return { ...line, quantity: line.quantity + 1 };
        }),
      );
    },
    [productMap],
  );

  const decrementQuantity = useCallback((productId: string) => {
    setCart((previous) =>
      previous.flatMap((line): CartLine[] => {
        if (line.productId !== productId) return [line];
        if (line.quantity <= 1) return [];
        return [{ ...line, quantity: line.quantity - 1 }];
      }),
    );
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart((previous) => previous.filter((line) => line.productId !== productId));
  }, []);

  const resolvedLines = useMemo<ResolvedCartLine[]>(() => {
    const lines: ResolvedCartLine[] = [];
    for (const line of cart) {
      const product = productMap.get(line.productId);
      if (product) lines.push({ product, quantity: line.quantity });
    }
    return lines;
  }, [cart, productMap]);

  const cartTotal = useMemo(
    () => resolvedLines.reduce((sum, line) => sum + line.product.price * line.quantity, 0),
    [resolvedLines],
  );
  const cartCount = useMemo(() => cart.reduce((sum, line) => sum + line.quantity, 0), [cart]);

  const groupedCategories = useMemo(() => {
    const groups = new Map<string, Product[]>();
    for (const product of products) {
      const group = groups.get(product.category);
      if (group) group.push(product);
      else groups.set(product.category, [product]);
    }
    return [...groups.entries()];
  }, [products]);

  const quantities = useMemo(
    () => new Map(cart.map((line): [string, number] => [line.productId, line.quantity])),
    [cart],
  );

  const openCheckout = useCallback(() => {
    setCartOpen(false);
    setCheckoutOpen(true);
  }, []);

  const handleConfirmOrder = useCallback(
    async (customerName: string) => {
      const order = await createOrder({
        customerName,
        items: resolvedLines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
          expectedPrice: line.product.price,
        })),
      });
      setCart([]);
      setCheckoutOpen(false);
      navigate(`/order/${order.id}`);
    },
    [resolvedLines, navigate],
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 pb-28 lg:flex-row lg:items-start lg:pb-6">
      <div className="min-w-0 flex-1">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-stone-900 sm:text-3xl">Notre carte</h1>
          <p className="mt-1 text-sm text-stone-500">
            Commandez en ligne, payez sur place et récupérez votre commande au comptoir dès qu'elle est prête.
          </p>
        </div>

        {error !== null && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <span className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </span>
            <button
              type="button"
              onClick={retry}
              className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
            >
              Réessayer
            </button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: SKELETON_COUNT }, (_, index) => (
              <div key={index} className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-soft">
                <div className="h-36 w-full animate-pulse bg-stone-200" />
                <div className="space-y-2.5 p-4">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-stone-200" />
                  <div className="h-3 w-full animate-pulse rounded bg-stone-100" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-stone-100" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-stone-300 bg-white px-4 py-16 text-center">
            <Coffee className="h-10 w-10 text-stone-300" />
            <p className="text-sm font-medium text-stone-600">Aucun produit disponible pour le moment.</p>
            <p className="text-xs text-stone-400">Revenez un peu plus tard, la carte arrive.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {groupedCategories.map(([category, categoryProducts]) => {
              const CategoryIcon = CATEGORY_ICONS[category] ?? Utensils;
              return (
                <section key={category}>
                  <div className="mb-3 flex items-center gap-2.5 border-b border-stone-200 pb-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                      <CategoryIcon className="h-5 w-5" />
                    </span>
                    <h2 className="text-lg font-bold text-stone-900">{CATEGORY_LABELS[category] ?? category}</h2>
                    <span className="ml-auto text-xs font-medium text-stone-400">
                      {categoryProducts.length} article{categoryProducts.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {categoryProducts.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        quantityInCart={quantities.get(product.id) ?? 0}
                        onAdd={addToCart}
                        onIncrement={incrementQuantity}
                        onDecrement={decrementQuantity}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* Panier : sidebar fixe sur écran large */}
      <aside className="hidden w-80 shrink-0 lg:block">
        <div className="sticky top-20">
          <CartPanel
            className="max-h-[calc(100vh-6rem)] rounded-2xl"
            lines={resolvedLines}
            onIncrement={incrementQuantity}
            onDecrement={decrementQuantity}
            onRemove={removeFromCart}
            onCheckout={openCheckout}
          />
        </div>
      </aside>

      {/* Panier : bouton flottant + feuille coulissante sur mobile */}
      {cartCount > 0 && (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-amber-600 py-3 pl-4 pr-5 text-white shadow-lg transition hover:bg-amber-700 lg:hidden"
        >
          <ShoppingBag className="h-5 w-5" />
          <span className="text-sm font-semibold">Mon panier</span>
          <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs font-bold">{cartCount}</span>
          <span className="hidden text-sm font-bold sm:inline">{formatPrice(cartTotal)}</span>
        </button>
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-stone-900/60"
            aria-hidden="true"
            onClick={() => setCartOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 animate-sheet-up">
            <CartPanel
              className="max-h-[75vh] rounded-t-2xl"
              lines={resolvedLines}
              onIncrement={incrementQuantity}
              onDecrement={decrementQuantity}
              onRemove={removeFromCart}
              onCheckout={openCheckout}
              onClose={() => setCartOpen(false)}
            />
          </div>
        </div>
      )}

      <CheckoutModal
        open={checkoutOpen}
        lines={resolvedLines}
        onClose={() => setCheckoutOpen(false)}
        onConfirm={handleConfirmOrder}
      />

      {/* Avertissements stock temps réel (éphémères) */}
      {warnings.length > 0 && (
        <div className="pointer-events-none fixed inset-x-4 top-16 z-50 flex flex-col items-end gap-2 sm:left-auto sm:right-4 sm:w-80">
          {warnings.map((warning) => (
            <div
              key={warning.id}
              className="pointer-events-auto flex w-full items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 shadow-soft"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{warning.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
