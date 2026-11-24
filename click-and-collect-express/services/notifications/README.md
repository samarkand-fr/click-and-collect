# notification-service

Microservice notifications temps réel du monorepo **Click & Collect Express** — Node.js 20 · TypeScript · Express 5 · RabbitMQ (amqplib) · **Socket.io**.

## Rôle dans la saga

```
order-service ── order.status_updated ──▶ notification-service (RabbitMQ)
                                              │ validation + historique mémoire
                                              ▼ diffusion temps réel (Socket.io)
                       ┌──────────────────────┴───────────────────────┐
                room `kitchen`                                  room `order_<id>`
              écran de cuisine                                  suivi client (1 commande)
         (reçoit TOUTES les commandes)                    (reçoit SA commande)
```

## Événements RabbitMQ

| Sens | Événement | Exchange | File |
|---|---|---|---|
| Consomme | `order.status_updated` | `cnc.orders.events` (topic) | `notifications.order-status` |

- Les messages sont persistants ; les échecs de traitement partent en **DLQ** (`cnc.notifications.dlx` → `notifications.order-status.dlq`).
- Acquittement **après** diffusion : un crash entre les deux re-diffuse la mise à jour (les écrans sont idempotents par statut).

## Contrat WebSocket (Socket.io, port dédié 3004)

| Événement | Sens | Charge utile |
|---|---|---|
| `notification.welcome` | serveur → client | capabilities (rooms, événements) |
| `room:join` | client → serveur | `room` + **ack** `{ ok, room?, clients? }` ou `{ ok: false, error }` |
| `room:leave` | client → serveur | `room` |
| `room:joined` | serveur → client | `{ room }` |
| `order.status_updated` | serveur → client | payload complet de la mise à jour |

**Rooms** : `kitchen` (globale, cuisine) et `order_<orderId>` (client). Toute autre room est refusée par un garde-fou serveur (`kitchen`, `order_[A-Za-z0-9_-]{1,64}`).

Exemple client :

```js
const socket = io('http://localhost:3004');            // même origine : io()
socket.emit('room:join', 'order_demo-123', (r) => console.log(r));
socket.on('order.status_updated', (e) => console.log(e.status));
```

## Routes HTTP

| Route | Description |
|---|---|
| `GET /health` | Sonde de vie (healthcheck compose) + broker + stats temps réel |
| `GET /events/recent?orderId=` | Historique mémoire (écrans qui (re)chargent) |
| `GET /realtime/stats` | Sockets connectés + snapshot des rooms |
| `GET /demo` | Page de démonstration (écran cuisine + suivi client, 2 connexions) |
| `POST /__test/status-update` | *(test)* injecte une mise à jour dans le pipeline de diffusion |

Le montant est exprimé **en centimes**.

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3004` | Port HTTP **et** WebSocket (même serveur) |
| `SERVICE_NAME` | `notification-service` | Nom logique (logs) |
| `RABBITMQ_URL` | *(vide)* | Sans valeur : consommation désactivée, Socket.io opérationnel |
| `ORDERS_EXCHANGE` | `cnc.orders.events` | Exchange des commandes |
| `STATUS_QUEUE` | `notifications.order-status` | File de consommation |
| `CORS_ORIGIN` | `*` | Origines Socket.io autorisées (liste CSV en prod) |
| `TEST_ENDPOINTS` | `true` hors prod | Active `POST /__test/*` |

> `DATABASE_URL` est ignoré : diffusion purement temps réel, historique en mémoire (100 derniers événements). `notifications-db` reste provisionnée pour un futur historique durable.

## Test en isolation (sans order-service)

```bash
# Depuis la racine du monorepo
npm install

# 1. Lancer le service (sans RabbitMQ : Socket.io + HTTP actifs)
npm run dev --workspace @cnc/notification-service    # port 3004

# 2. Connecter un client de test (kitchen + order_<id> + garde-fou)
npm run client:test --workspace @cnc/notification-service

# 3. Injecter une mise à jour → visible chez le client de test
curl -X POST http://localhost:3004/__test/status-update \
  -H 'Content-Type: application/json' \
  -d '{"orderId":"demo-123","status":"READY","previousStatus":"PREPARING"}'

# 4. Avec RabbitMQ : publier de vrais order.status_updated (simule order-service)
npm run publish:test --workspace @cnc/notification-service -- \
  --orderId demo-123 --sequence PAID,PREPARING,READY

# 5. Page de démonstration interactive
#    http://localhost:3004/demo
```

## Développement / Docker

```bash
npm run typecheck --workspace @cnc/notification-service
docker compose build notifications-service
```
