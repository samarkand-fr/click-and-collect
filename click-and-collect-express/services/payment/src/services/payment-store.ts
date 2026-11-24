// =====================================================================
//  Store mémoire des paiements traités.
//
//  Volontairement en mémoire : le paiement est simulé et idempotent, et
//  le service doit rester stateless pour se redimensionner librement.
//  payment-db (docker-compose) reste disponible pour une persistance
//  future (reçus, audit). Les données sont réinitialisées au redémarrage.
// =====================================================================
import type { PaymentRecord } from '../types/payment.types.js';

/** Taille maximale du cache (protection mémoire sur longue vie). */
const MAX_RECORDS = 500;

class PaymentStore {
  /** orderId → dernier traitement. Map ordonnée par récence d'insertion. */
  private byOrder = new Map<string, PaymentRecord>();

  save(record: PaymentRecord): void {
    // Un orderId → un seul paiement : le dernier traitement fait foi
    // (les redelivery re-publient le résultat existant, voir order.consumer.ts).
    this.byOrder.delete(record.orderId); // ré-insère en fin de Map (récence)
    this.byOrder.set(record.orderId, record);

    if (this.byOrder.size > MAX_RECORDS) {
      const oldest = this.byOrder.keys().next().value;
      if (oldest !== undefined) this.byOrder.delete(oldest);
    }
  }

  getByOrderId(orderId: string): PaymentRecord | undefined {
    return this.byOrder.get(orderId);
  }

  /** Les plus récents d'abord. */
  listRecent(limit = 100): PaymentRecord[] {
    return [...this.byOrder.values()].slice(-limit).reverse();
  }

  get size(): number {
    return this.byOrder.size;
  }
}

export const paymentStore = new PaymentStore();
