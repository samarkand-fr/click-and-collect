# payment-service

Microservice paiement du monorepo **Click & Collect Express** — Node.js 20 · TypeScript · Express 5 · RabbitMQ (amqplib).

## Rôle dans la saga (chorégraphie, sans orchestrateur)

```
order-service ── order.created ──▶ payment-service
                                     │  traitement simulé 2 s
                                     │  (90 % succès / 10 % échec,
                                     │   ou forceOutcome en test)
                                     ▼
              payment.succeeded / payment.failed ──▶ order-service
                                                     (PAID / CANCELLED
                                                      + release du stock)
```

## Événements RabbitMQ

| Sens | Événement | Exchange | File |
|---|---|---|---|
| Consomme | `order.created` | `cnc.orders.events` (topic) | `payments.order-created` |
| Publie | `payment.succeeded` | `cnc.payments.events` (topic, publisher confirms) | — |
| Publie | `payment.failed` | `cnc.payments.events` (topic, publisher confirms) | — |

- Les messages sont persistants ; les échecs de traitement partent en **DLQ** (`cnc.payments.dlx` → `payments.order-created.dlq`) pour rejeu manuel.
- **Idempotence** : une redelivery du même `order.created` re-publie le résultat existant au lieu de re-débiter le client.

## Paramètre de test (issue contrôlable)

Le payload `order.created` accepte un champ optionnel **`forceOutcome`** (`'success' | 'failure'`) qui force l'issue du paiement ; sinon le tirage aléatoire s'applique (90 % / 10 % par défaut). Trois façons de contrôler :

1. **Endpoints HTTP de test** (activés hors production, ou `TEST_ENDPOINTS=true`) :
   ```bash
   # Processeur seul (délai 2 s inclus) — sans RabbitMQ :
   curl -X POST http://localhost:3003/__test/process-payment \
     -H 'Content-Type: application/json' \
     -d '{"forceOutcome": "failure", "totalAmount": 4500}'

   # Boucle complète : publie un order.created puis le consomme lui-même :
   curl -X POST http://localhost:3003/__test/simulate-order-created \
     -H 'Content-Type: application/json' -d '{}'
   ```
2. **Script de simulation** (publie de vrais `order.created` sur RabbitMQ) :
   ```bash
   npm run simulate --workspace @cnc/payment-service -- --count 3 --outcome failure
   ```
3. **Variables d'environnement** : `PAYMENT_SUCCESS_RATE` (0–1) et `PAYMENT_PROCESSING_MS`.

## Routes HTTP

| Route | Description |
|---|---|
| `GET /health` | Sonde de vie (docker-compose healthcheck) + état du broker |
| `GET /payments` | Derniers traitements (mémoire du process) |
| `GET /payments/:orderId` | Résultat du paiement d'une commande |
| `POST /__test/process-payment` | *(test)* traite un paiement sans broker |
| `POST /__test/simulate-order-created` | *(test)* boucle complète via RabbitMQ |

Le montant est toujours exprimé **en centimes**.

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3003` | Port HTTP |
| `SERVICE_NAME` | `payment-service` | Nom logique (logs) |
| `RABBITMQ_URL` | *(vide)* | Sans valeur : événements désactivés, HTTP opérationnel |
| `ORDERS_EXCHANGE` | `cnc.orders.events` | Exchange des commandes |
| `PAYMENTS_EXCHANGE` | `cnc.payments.events` | Exchange des paiements |
| `ORDER_CREATED_QUEUE` | `payments.order-created` | File de consommation |
| `PAYMENT_SUCCESS_RATE` | `0.9` | Taux de succès du tirage aléatoire |
| `PAYMENT_PROCESSING_MS` | `2000` | Durée du traitement simulé |
| `PAYMENT_PROVIDER` | `mock` | `mock` implémenté ; `stripe` réservé (repli mock) |
| `TEST_ENDPOINTS` | `true` hors prod | Active `POST /__test/*` |

> `DATABASE_URL` est ignoré : le paiement simulé est stateless (store mémoire, 500 derniers traitements). `payment-db` reste provisionné pour une future persistance des reçus.

## Développement

```bash
# Depuis la racine du monorepo
npm install
npm run dev --workspace @cnc/payment-service      # tsx watch (port 3003)
npm run typecheck --workspace @cnc/payment-service

# Docker (image de production)
docker compose build payment-service
```
