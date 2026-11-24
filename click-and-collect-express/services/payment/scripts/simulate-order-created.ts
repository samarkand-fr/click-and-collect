// =====================================================================
//  Script de simulation — publie N commandes `order.created` sur
//  l'exchange topic `cnc.orders.events`, exactement comme le ferait
//  order-service. Utile pour tester payment-service en isolation.
//
//  Usage :
//    npm run simulate -- --count 3 --outcome random
//    npm run simulate -- --outcome failure --total 2500
//
//  Options :
//    --count N            nombre d'événements (défaut : 1)
//    --outcome X          success | failure | random (défaut : random)
//    --total CENTIMES     montant total en centimes (défaut : 4500)
//    --name "Prénom"      nom du client (défaut : Client simulation)
//
//  Connexion : RABBITMQ_URL, sinon amqp://127.0.0.1:5672
//  (docker compose publie RabbitMQ sur le port 5672 de l'hôte).
// =====================================================================
import { randomUUID } from 'node:crypto';
import { connect } from 'amqplib';

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const count = Math.max(1, Number(argValue('--count') ?? 1));
const outcome = (argValue('--outcome') ?? 'random') as 'success' | 'failure' | 'random';
const totalAmount = Number(argValue('--total') ?? 4500);
const customerName = argValue('--name') ?? 'Client simulation';

const rabbitUrl =
  process.env.RABBITMQ_URL ?? 'amqp://cnc_admin:change_me_rabbit@127.0.0.1:5672';
const ordersExchange = process.env.ORDERS_EXCHANGE ?? 'cnc.orders.events';

if (!Number.isInteger(totalAmount) || totalAmount <= 0) {
  console.error('--total doit être un nombre entier positif de centimes');
  process.exit(1);
}

interface OrderCreatedPayload {
  orderId: string;
  customerName: string;
  items: Array<{ productId: string; name: string; unitPrice: number; quantity: number; subtotal: number }>;
  totalAmount: number;
  createdAt: string;
  forceOutcome?: 'success' | 'failure';
}

async function main(): Promise<void> {
  const connection = await connect(rabbitUrl, { heartbeat: 10 });
  const channel = await connection.createConfirmChannel();
  await channel.assertExchange(ordersExchange, 'topic', { durable: true });

  for (let i = 0; i < count; i += 1) {
    const payload: OrderCreatedPayload = {
      orderId: randomUUID(),
      customerName: count > 1 ? `${customerName} #${i + 1}` : customerName,
      items: [
        {
          productId: 'demo-espresso',
          name: 'Espresso (simulation)',
          unitPrice: totalAmount,
          quantity: 1,
          subtotal: totalAmount,
        },
      ],
      totalAmount,
      createdAt: new Date().toISOString(),
      ...(outcome !== 'random' ? { forceOutcome: outcome } : {}),
    };

    const event = {
      eventId: randomUUID(),
      eventType: 'order.created',
      serviceName: 'payment-service (simulation)',
      occurredAt: new Date().toISOString(),
      payload,
    };

    channel.publish(
      ordersExchange,
      'order.created',
      Buffer.from(JSON.stringify(event), 'utf8'),
      {
        persistent: true,
        contentType: 'application/json',
        messageId: event.eventId,
        type: event.eventType,
      },
    );

    console.log(`[${i + 1}/${count}] order.created publié — orderId=${payload.orderId}` +
      `${outcome !== 'random' ? ` (issue forcée : ${outcome})` : ''}`);
  }

  await channel.waitForConfirms();
  console.log(`\nTerminé : ${count} événement(s) publié(s) sur ${ordersExchange}.`);
  console.log('Suivre les résultats : docker compose logs -f payment-service');
  await connection.close();
}

main().catch((err) => {
  console.error('Échec de la simulation :', err);
  process.exit(1);
});
