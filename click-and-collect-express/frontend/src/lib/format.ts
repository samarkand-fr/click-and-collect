// Fonctions de formatage : prix en centimes (EUR), dates et temps relatif (fr-FR).

const priceFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

/** Formate un montant en centimes, ex. 450 → "4,50 €". */
export function formatPrice(amountInCentimes: number): string {
  return priceFormatter.format(amountInCentimes / 100);
}

/** Formate une date ISO en date + heure courtes (fr-FR). */
export function formatDateTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return dateTimeFormatter.format(date);
}

/** Temps relatif lisible, ex. "à l'instant", "il y a 2 min", "il y a 3 h", "il y a 2 j". */
export function formatRelativeTime(isoDate: string, now: number = Date.now()): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  const elapsedSeconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));
  if (elapsedSeconds < 60) return "à l'instant";
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `il y a ${elapsedMinutes} min`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `il y a ${elapsedHours} h`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  return `il y a ${elapsedDays} j`;
}
