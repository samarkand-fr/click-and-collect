// =====================================================================
//  Publie des événements `order.status_updated` sur l'exchange topic
//  `cnc.orders.events` — simule order-service pour tester
//  notification-service (rooms Socket.io) en isolation.
//
//  Usage :
//    npm run publish:test --workspace @cnc/notification-service -- \
//      --orderId demo-123 --sequence PAID,PREPARING,READY
//    npm run publish:test --workspace @cnc/notification-service -- \
//      --orderId demo-123 --status CANCELLED --reason payment_failed
//
//  Options :
//    --orderId X          identifiant de commande (défaut : aléatoire)
//    --customer "Prénom"  nom du client (défaut : Client simulation)
//    --status X           statut cible unique (défaut : PREPARING)
//    --previous X         statut précédent (défaut : PAID)
//    --total CENTIMES     montant total en centimes (défaut : 4500)
//    --sequence "A,B,.."  publie une chaîne de transitions
//
//  Connexion : RABBITMQ_URL, sinon amqp://127.0.0.1:5672
// =====================================================================
import { randomUUID } from 'node:crypto';
import { connect } from 'amqplib';

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const orderId = argValue('--orderId') ?? `sim-${randomUUID().slice(0, 8)}`;
const customerName = argValue('--customer') ?? 'Client simulation';
const totalAmount = Number(argValue('--total') ?? 4500);
const sequenceRaw = argValue('--sequence');
const singleStatus = argValue('--status') ?? 'PREPARING';
const previousOverride = argValue('--previous');

const sequence = sequenceRaw
  ? sequenceRaw.split(',').map((s) => s.trim()).filter(Boolean)
  : [singleStatus];

const rabbitUrl =
  process.env.RABBITMQ_URL ?? 'amqp://cnc_admin:change_me_rabbit@127.0.0.1:5672';
const ordersExchange = process.env.ORDERS_EXCHANGE ?? 'cnc.orders.events';

if (!Number.isInteger(totalAmount) || totalAmount < 0) {
  console.error('--total doit être un entier positif de centimes');
  process.exit(1);
}
if (sequence.length === 0) {
  console.error('--sequence vide');
  process.exit(1);
}

async function main(): Promise<void> {
  const connection = await connect(rabbitUrl, { heartbeat: 10 });
  const channel = await connection.createConfirmChannel();
  await channel.assertExchange(ordersExchange, 'topic', { durable: true });

  let previous = previousOverride ?? 'PAID';
  for (const [index, status] of sequence.entries()) {
    const payload = {
      orderId,
      customerName,
      previousStatus: previous,
      status,
      totalAmount,
      reason: sequence.length > 1 ? 'kitchen_update' : (argValue('--reason') ?? 'kitchen_update'),
      occurredAt: new Date().toISOString(),
    };

    const event = {
      eventId: randomUUID(),
      eventType: 'order.status_updated',
      serviceName: 'notification-service (simulation)',
      occurredAt: new Date().toISOString(),
      payload,
    };

    channel.publish(
      ordersExchange,
      'order.status_updated',
      Buffer.from(JSON.stringify(event), 'utf8'),
      {
        persistent: true,
        contentType: 'application/json',
        messageId: event.eventId,
        type: event.eventType,
      },
    );

    console.log(
      `[${index + 1}/${sequence.length}] order.status_updated publié — ` +
        `orderId=${orderId} ${payload.previousStatus} → ${status}`,
    );
    previous = status;
  }

  await channel.waitForConfirms();
  console.log(`\nTerminé : ${sequence.length} événement(s) publié(s) sur ${ordersExchange}.`);
  console.log('Vérifier la diffusion : npm run client:test --workspace @cnc/notification-service');
  await connection.close();
}

main().catch((err) => {
  console.error('Échec de la publication :', err);
  process.exit(1);
});
