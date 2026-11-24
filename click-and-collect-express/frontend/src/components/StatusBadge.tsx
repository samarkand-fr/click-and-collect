// Badge de statut d'une commande : libellés et couleurs en français.
import type { OrderStatus } from '../types';

const STATUS_CONFIG: Record<OrderStatus, { label: string; className: string }> = {
  PENDING: { label: 'En attente de paiement', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  PAID: { label: 'Payée', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  PREPARING: { label: 'En préparation', className: 'bg-orange-100 text-orange-800 border-orange-200' },
  READY: { label: 'Prête au comptoir', className: 'bg-emerald-600 text-white border-emerald-600' },
  CANCELLED: { label: 'Annulée', className: 'bg-red-100 text-red-800 border-red-200' },
};

interface StatusBadgeProps {
  status: OrderStatus;
  className?: string;
}

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.className} ${className}`}
    >
      {config.label}
    </span>
  );
}
