// Barre de progression du cycle de vie d'une commande (4 étapes).
import { CheckCircle2 } from 'lucide-react';
import type { OrderStatus } from '../types';

const STEPS: Array<{ status: OrderStatus; label: string }> = [
  { status: 'PENDING', label: 'En attente de paiement' },
  { status: 'PAID', label: 'Payée' },
  { status: 'PREPARING', label: 'En préparation' },
  { status: 'READY', label: 'Prête au comptoir' },
];

interface ProgressBarProps {
  status: OrderStatus;
}

export default function ProgressBar({ status }: ProgressBarProps) {
  const cancelled = status === 'CANCELLED';
  const currentIndex = cancelled ? -1 : STEPS.findIndex((step) => step.status === status);
  const percent = currentIndex <= 0 ? 0 : (currentIndex / (STEPS.length - 1)) * 100;

  return (
    <div>
      <div className="relative mb-3 h-1.5 rounded-full bg-stone-200">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-amber-500 transition-all duration-700 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ol className="grid grid-cols-4 gap-1">
        {STEPS.map((step, index) => {
          const done = !cancelled && index < currentIndex;
          const active = !cancelled && index === currentIndex;
          return (
            <li key={step.status} className="flex flex-col items-center gap-1.5 text-center">
              {done ? (
                <CheckCircle2 className="h-6 w-6 text-amber-500" />
              ) : (
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-semibold ${
                    active
                      ? 'border-amber-500 bg-amber-500 text-white shadow'
                      : 'border-stone-300 bg-white text-stone-400'
                  }`}
                >
                  {index + 1}
                </span>
              )}
              <span
                className={`text-[11px] leading-tight sm:text-xs ${
                  done
                    ? 'font-medium text-amber-700'
                    : active
                      ? 'font-semibold text-amber-900'
                      : 'text-stone-500'
                }`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
