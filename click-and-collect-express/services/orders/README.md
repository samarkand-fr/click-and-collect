# order-service

Microservice commandes — cœur du flux Click & Collect : réservation du stock, machine à états et orchestration par événements.
Port interne : `3002` · Base : `orders_db` · Exchange publié : `cnc.orders.events` · File consommée : `orders.payment-events` (+ DLQ).

## Modèle Order

`id` (cuid) · `customerName` · `items` (JSON — snapshots nom/prix au moment de la commande) · `totalAmount` (centimes) · `status` (`PENDING → PAID → PREPARING → READY`, branche `CANCELLED`) · `createdAt`

## Endpoints

| Méthode | Route                 | Description                                                                | Codes |
|---------|-----------------------|----------------------------------------------------------------------------|-------|
| GET     | `/health`             | Sonde de vie (+ état du broker)                                            | 200   |
| POST    | `/orders`             | Création : reserve stock+prix → PENDING → publication `order.created`      | 201 · 400 · 404 · **409** · 502 · 503 |
| GET     | `/orders?status=`     | Liste (tableau de bord cuisine / suivi)                                    | 200   |
| GET     | `/orders/:id`         | Détail / suivi client                                                      | 200 · 404 |
| PATCH   | `/orders/:id/status`  | Cuisine : `PAID → PREPARING → READY`                                       | 200 · 400 · 404 · **409** |

> Le gateway expose ces routes publiquement sous `/api/v1/orders/**`.

## Flux de création (POST /orders)

```text
POST /orders { customerName, items: [{ productId, quantity, expectedPrice? }] }
   │
   ├─1► catalog-service  POST /products/reserve
   │      vérifie existence + disponibilité + stock + PRIX (atomique)
   │      404 / 409 → erreur propagée au client, RIEN n'est créé
   │
   ├─2► PostgreSQL : Order{ status: PENDING, totalAmount = Σ prix catalogue }
   │
   ├─3► RabbitMQ : order.created (publisher confirm)
   │      échec de publication → compensation POST /products/release + 503
   │
   └─► 201 { order }
```

Le **total est toujours calculé depuis les prix autoritaires du catalogue** — jamais depuis les prix envoyés par le client (`expectedPrice` sert uniquement à détecter une divergence → `409 price_mismatch`).

## Événements consommés (file `orders.payment-events`)

| Événement          | Action                                                                                     |
|--------------------|--------------------------------------------------------------------------------------------|
| `payment.succeeded`| `PENDING → PAID`, publication `order.status_updated` (raison `payment_succeeded`)          |
| `payment.failed`   | `PENDING → CANCELLED`, publication `order.status_updated`, puis `POST /products/release`   |

Idempotence : `payment.succeeded` sur une commande déjà `PAID`, ou `payment.failed` sur une déjà `CANCELLED`, sont acquittés sans effet. Un traitement en échec → `nack` sans requeue → **DLQ** `orders.payment-events.dlq` (inspection / rejeu manuel).

## Machine à états (PATCH /orders/:id/status)

```text
PENDING ──(payment.succeeded)──► PAID ──(cuisine)──► PREPARING ──(cuisine)──► READY
   └──(payment.failed)──► CANCELLED
```

Toute transition invalide → `409` avec `{ currentStatus, requestedStatus, allowedNextStatus }`. Chaque changement publie `order.status_updated` (consommé par notifications-service → SSE client).

## Garanties & limites connues

- **reserve / release ne sont pas idempotents** → aucun retry automatique (un timeout après succès côté catalog réserverait deux fois le stock). En production : identifiants de réservation + TTL + job de réconciliation, et pattern **Outbox** pour une publication garantie.
- **Publisher confirms** : `order.created` n'est considéré publié qu'après ack du broker (timeout configurable) — sinon compensation + `503`.
- **Compensations best-effort** : si la libération échoue (catalog hors ligne), l'incident est loggué en `fatal` pour réconciliation — la commande reste annulée.
- **Topologie re-assertée** à chaque (re)connexion → les services peuvent démarrer dans n'importe quel ordre.

## Développement local

```bash
docker compose up -d orders-db catalog-db rabbitmq
npm install                               # à la racine du monorepo
npm run db:migrate -w services/orders     # ou : prisma db push
npm run dev -w services/orders            # tsx watch → http://localhost:3002
```

## Variables d'environnement

| Variable                      | Requis | Défaut                          | Rôle                                        |
|-------------------------------|--------|---------------------------------|---------------------------------------------|
| `DATABASE_URL`                | oui    | —                               | PostgreSQL (orders_db)                      |
| `CATALOG_URL`                 | oui    | —                               | http://catalog-service:3001                 |
| `PORT`                        | non    | 3002                            | Port d'écoute HTTP                          |
| `CATALOG_TIMEOUT_MS`          | non    | 5000                            | Timeout des appels catalogue                |
| `RABBITMQ_URL`                | non    | —                               | Si absent : événements désactivés           |
| `ORDERS_EXCHANGE`             | non    | `cnc.orders.events`             | Exchange topic des commandes                |
| `PAYMENTS_EXCHANGE`           | non    | `cnc.payments.events`           | Exchange des événements paiement            |
| `BROKER_CONFIRM_TIMEOUT_MS`   | non    | 5000                            | Timeout des publisher confirms              |
| `LOG_LEVEL`                   | non    | info (debug en dev)             | Niveau pino                                 |
