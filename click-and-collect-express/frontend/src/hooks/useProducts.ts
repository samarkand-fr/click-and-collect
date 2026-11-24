// Hook carte des produits : chargement REST + mises à jour de stock en temps réel.
import { useCallback, useEffect, useState } from 'react';
import { fetchProducts } from '../lib/api';
import { socket } from '../lib/socket';
import type { Product, ProductUpdatedEvent } from '../types';

export interface UseProductsResult {
  products: Product[];
  loading: boolean;
  error: string | null;
  retry: () => Promise<void>;
}

export function useProducts(): UseProductsResult {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchProducts();
      setProducts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger la carte.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Stock temps réel : met à jour les produits en place (diffusion globale, sans room).
  useEffect(() => {
    const onProductUpdated = (payload: ProductUpdatedEvent) => {
      setProducts((previous) =>
        previous.map((product) =>
          product.id === payload.productId
            ? {
                ...product,
                name: payload.name ?? product.name,
                stock: payload.stock,
                isAvailable: payload.isAvailable,
              }
            : product,
        ),
      );
    };
    socket.on('catalog.product.updated', onProductUpdated);
    return () => {
      socket.off('catalog.product.updated', onProductUpdated);
    };
  }, []);

  return { products, loading, error, retry: load };
}
