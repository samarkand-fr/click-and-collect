// Types partagés du domaine : produits, commandes, panier et événements temps réel.

// ── Statuts de commande ──────────────────────────────────────────────────────

export type OrderStatus = 'PENDING' | 'PAID' | 'PREPARING' | 'READY' | 'CANCELLED';

// ── Catalogue ────────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  name: string;
  description: string | null;
  /** Prix en centimes (entier). */
  price: number;
  category: string;
  stock: number;
  imageUrl: string | null;
  isAvailable: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Commandes ────────────────────────────────────────────────────────────────

export interface OrderItem {
  productId: string;
  name: string;
  /** Prix unitaire en centimes. */
  unitPrice: number;
  quantity: number;
  /** Sous-total de la ligne en centimes. */
  subtotal: number;
}

export interface Order {
  id: string;
  customerName: string;
  items: OrderItem[];
  /** Montant total en centimes. */
  totalAmount: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

// ── Panier (côté client) ─────────────────────────────────────────────────────

export interface CartLine {
  productId: string;
  quantity: number;
}

export interface ResolvedCartLine {
  product: Product;
  quantity: number;
}

// ── Enveloppes REST ──────────────────────────────────────────────────────────

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ListResponse<T> {
  data: T[];
  total: number;
}

export interface ItemResponse<T> {
  data: T;
}

// ── Contrat Socket.io ────────────────────────────────────────────────────────

/** Ack du serveur pour 'room:join'. */
export interface RoomJoinAck {
  ok: boolean;
  room?: string;
  clients?: number;
  error?: string;
}

/** Événement 'notification.welcome' émis à la connexion. */
export interface WelcomeNotification {
  message: string;
  rooms: string[];
  events: string[];
  connectedAt: string;
}

/** Événement 'order.status_updated' (rooms `kitchen` et `order_<id>`). */
export interface OrderStatusUpdatedEvent {
  orderId: string;
  customerName: string;
  previousStatus: OrderStatus;
  status: OrderStatus;
  /** Montant total en centimes. */
  totalAmount: number;
  reason: 'payment_succeeded' | 'payment_failed' | 'kitchen_update';
  paymentId?: string;
  occurredAt: string;
}

/** Événement 'catalog.product.updated' : stock temps réel (diffusion globale). */
export interface ProductUpdatedEvent {
  productId: string;
  name?: string;
  stock: number;
  isAvailable: boolean;
  source?: 'reserve' | 'release' | 'admin';
}
