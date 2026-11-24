// Client HTTP minimaliste pour l'API REST : chemins relatifs, erreurs typées.
import type { ApiErrorBody, ItemResponse, ListResponse, Order, OrderStatus, Product } from '../types';

const API_BASE = '/api';

/** Erreur d'appel API : expose le message FR du serveur, le code et le statut HTTP. */
export class ApiRequestError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** Extrait le corps { error: { code, message, details? } } d'une réponse d'erreur. */
function extractErrorBody(payload: unknown): ApiErrorBody | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const candidate = (payload as { error?: unknown }).error;
  if (typeof candidate !== 'object' || candidate === null) return null;
  const body = candidate as { code?: unknown; message?: unknown; details?: unknown };
  return {
    code: typeof body.code === 'string' ? body.code : 'UNKNOWN_ERROR',
    message: typeof body.message === 'string' ? body.message : 'Une erreur est survenue.',
    details: body.details,
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    throw new ApiRequestError(
      'Impossible de contacter le serveur. Vérifiez que la passerelle est démarrée.',
      'NETWORK_ERROR',
      0,
    );
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const apiError = extractErrorBody(payload);
    throw new ApiRequestError(
      apiError?.message ?? `Le serveur a répondu avec le code ${response.status}.`,
      apiError?.code ?? 'HTTP_ERROR',
      response.status,
      apiError?.details,
    );
  }

  return payload as T;
}

// ── Catalogue ────────────────────────────────────────────────────────────────

/** Liste des produits disponibles (le tri par défaut filtre déjà les indisponibles). */
export async function fetchProducts(): Promise<Product[]> {
  const response = await request<ListResponse<Product>>('/products');
  return response.data;
}

// ── Commandes ────────────────────────────────────────────────────────────────

export interface CreateOrderItemInput {
  productId: string;
  quantity: number;
  /** Prix affiché au client, en centimes — toujours envoyé tel quel. */
  expectedPrice: number;
}

export interface CreateOrderInput {
  customerName: string;
  items: CreateOrderItemInput[];
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const response = await request<ItemResponse<Order>>('/orders', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return response.data;
}

/** Toutes les commandes, triées de la plus récente à la plus ancienne. */
export async function fetchOrders(): Promise<Order[]> {
  const response = await request<ListResponse<Order>>('/orders');
  return [...response.data].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function fetchOrderById(orderId: string): Promise<Order> {
  const response = await request<ItemResponse<Order>>(`/orders/${encodeURIComponent(orderId)}`);
  return response.data;
}

/** Transition cuisine uniquement : PREPARING ou READY. */
export async function updateOrderStatus(
  orderId: string,
  status: Extract<OrderStatus, 'PREPARING' | 'READY'>,
): Promise<Order> {
  const response = await request<ItemResponse<Order>>(`/orders/${encodeURIComponent(orderId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  return response.data;
}
