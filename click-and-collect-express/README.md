# Click & Collect Express

Application fullstack en microservices : commande de repas / café avec **suivi de préparation en temps réel** et **stock en direct**.

## Stack

| Couche     | Technologie                                     |
|------------|-------------------------------------------------|
| Backend    | Node.js 20 · TypeScript · Express 5             |
| Gateway    | http-proxy-middleware v3 · express-rate-limit · CORS |
| Données    | PostgreSQL 16 — une instance isolée par service |
| Broker     | RabbitMQ 3.13 — exchanges topic, queues durables + DLQ |
| Frontend   | React 18 · Vite · TypeScript · Tailwind CSS · socket.io-client |
| Temps réel | Socket.io — rooms `kitchen` (cuisine) et `order_<id>` (client) |

## Démarrage pas à pas

### 0. Prérequis

| Outil                       | Version | Vérification                      |
|-----------------------------|---------|-----------------------------------|
| Docker Engine               | ≥ 24    | `docker --version`                |
| Docker Compose (plugin)     | v2      | `docker compose version`          |
| Node.js + npm (dev local)   | ≥ 20    | `node --version && npm --version` |
| Git                         | —       | `git --version`                   |

> **Windows / macOS** : installer [Docker Desktop](https://docs.docker.com/get-docker/)
> et le **démarrer** avant de continuer. **Linux** : `docker-ce` +
> `docker-compose-plugin`.

### 1. Télécharger le projet

```bash
git clone <url-du-dépôt> click-and-collect-express
cd click-and-collect-express
# Sans git : télécharger l'archive ZIP du dépôt puis la décompresser.
```

### 2. Activer la configuration

```bash
cp .env.example .env
```

Les valeurs par défaut conviennent au développement local. Options utiles :
`PAYMENT_SUCCESS_RATE` (taux de succès du paiement simulé),
`TEST_ENDPOINTS=true` (endpoints `/api/*/__test/*`), `SEED_ON_BOOT=true`
(6 produits créés au démarrage du catalogue). Chaque dossier `gateway/` et
`services/*` contient aussi son `.env.example` pour le mode dev hors Docker.

### 3. Build des images

```bash
docker compose build
```

Première exécution : **3 à 5 min** (téléchargement des images
node/postgres/rabbitmq + compilation TypeScript + génération Prisma).
Les builds suivants passent par le cache Docker (quelques secondes).
Vous pouvez fusionner build + run : `docker compose up -d --build`.

### 4. Lancer la stack

```bash
docker compose up -d
docker compose ps            # les 11 conteneurs doivent être Up (healthy)
```

Ordre automatique : RabbitMQ + 4 PostgreSQL → migrations Prisma +
healthchecks des 4 microservices → gateway → frontend nginx.
Comptez **30 à 60 s**. Logs en continu : `docker compose logs -f`.

### 5. Vérifier

| URL                          | Attendu                                                       |
|------------------------------|---------------------------------------------------------------|
| http://localhost:5173        | **Application web** — vue Client `/` + vue Cuisine `/kitchen` |
| http://localhost:8080/health | `{"status":"ok","service":"api-gateway",...}`                 |
| http://localhost:15672       | RabbitMQ UI — login `cnc_admin` / `change_me_rabbit`          |

Parcours de démonstration complet :

1. Ouvrir `http://localhost:5173` → la carte affiche les **6 produits** avec le stock en direct.
2. Ajouter des articles au panier → valider avec un **prénom** → la commande part (`POST /api/orders` via le gateway) ; le paiement est simulé (2 s, 90 % de succès par défaut).
3. La page de suivi affiche la barre *En attente de paiement → Payée → En préparation → Prête au comptoir*, mise à jour **en temps réel** via WebSocket (sans recharger la page).
4. Ouvrir `/kitchen` dans un autre onglet : la commande apparaît instantanément dans le Kanban, avancez-la avec les boutons d'action.
5. Sur la carte client, le **stock se met à jour en direct** (réservation / libération via les événements `catalog.product.*`).

### 6. Arrêter / réinitialiser

```bash
docker compose down            # arrêt (données conservées)
docker compose down -v         # arrêt + effacement des données (bases, RabbitMQ)
```

### Développement hors Docker (optionnel)

Installer les dépendances, démarrer l'infra (bases + broker), puis lancer
les 6 processus Node en parallèle :

```bash
npm install                                              # workspaces npm
docker compose up -d rabbitmq catalog-db orders-db payment-db notifications-db

# Clients Prisma + migrations (catalog & orders)
npm run prisma:generate -w @cnc/catalog-service
npm run prisma:generate -w @cnc/order-service
npm run db:migrate -w @cnc/catalog-service
npm run db:migrate -w @cnc/order-service

# Dans 6 terminaux (chaque service lit son .env — voir les .env.example) :
npm run dev -w @cnc/catalog-service        # 3001
npm run dev -w @cnc/order-service          # 3002
npm run dev -w @cnc/payment-service        # 3003
npm run dev -w @cnc/notification-service   # 3004 — HTTP + WebSocket
npm run dev -w @cnc/gateway                # 8080 — proxy /api + /socket.io
npm run dev -w frontend                    # 5173 — proxy /api + /socket.io → 8080
```

> Les microservices ne publient **aucun port hôte** en mode Docker : tout
> passe par le gateway (REST `/api/**` et WebSocket `/socket.io`). En dev,
> le serveur Vite proxifie lui-même `/api` et `/socket.io` vers
> `http://localhost:8080`, et le gateway lit `gateway/.env` (copier
> `gateway/.env.example`).

### Dépannage rapide

| Symptôme | Cause probable / solution |
|---|---|
| `docker: command not found` | Docker n'est pas installé ou absent du PATH |
| `Cannot connect to the Docker daemon` | Docker Desktop / le démon n'est pas démarré |
| `port is already allocated` (8080 / 5173 / 15672) | Port occupé : arrêter l'application concurrente ou changer le mapping dans `docker-compose.yml` |
| `frontend` reste `unhealthy` au `docker compose ps` | Le gateway n'a pas fini ses healthchecks — patienter, ou `docker compose logs gateway` |
| Catalogue vide | `SEED_ON_BOOT=false` dans `.env` → repasser à `true` puis `docker compose up -d --force-recreate catalog-service` |
| Réponse 409 `STOCK_INSUFFICIENT` | Comportement métier normal : stock épuisé pour un article |
| Repartir de zéro | `docker compose down -v && docker compose up -d --build` |

## Routage du gateway

| Requête publique | Destination |
|---|---|
| `GET /api/products` · `GET /api/products/:id` · `POST /api/products` · `POST /api/products/reserve` · `POST /api/products/release` | catalog-service |
| `POST /api/orders` · `GET /api/orders` · `GET /api/orders/:id` · `PATCH /api/orders/:id/status` | orders-service |
| `GET /api/payments/:orderId` | payment-service |
| `GET /api/notifications/events/recent` · `GET /api/notifications/realtime/stats` | notifications-service |
| `WS /socket.io` (polling + upgrade) | notifications-service |

`/api/v1/**` est un alias strictement équivalent de `/api/**`. Toutes les
erreurs (gateway inclus) partagent le contrat JSON
`{ error: { code, message, details? } }` ; le rate-limit par IP (120 req/min
par défaut) répond en JSON `429 RATE_LIMITED`.

## Services

| Service                | Port interne | Base de données  |
|------------------------|--------------|------------------|
| gateway                | 8080         | —                |
| services/catalog       | 3001         | catalog_db       |
| services/orders        | 3002         | orders_db        |
| services/payment       | 3003         | payment_db       |
| services/notifications | 3004         | notifications_db |

## Saga (chorégraphie par événements)

Enveloppe d'événement commune (`@cnc/shared`) : `{ eventId, eventType, serviceName, occurredAt, payload }` — routing key = `eventType`.

1. `POST /api/orders` (via gateway) — `orders` réserve le stock (catalog), crée la commande (**PENDING**) et publie **`order.created`**
2. `payment` consomme, simule le débit (2 s, **90 % succès / 10 % échec** aléatoire ou `forceOutcome` en test) et publie **`payment.succeeded`** ou **`payment.failed`** (publisher confirms)
3. `orders` consomme le résultat → **PAID** (ou **CANCELLED** + release du stock), publie **`order.status_updated`**
4. `notifications` consomme `order.status_updated` → diffuse en WebSocket sur la room globale **`kitchen`** (écran cuisine) ET la room **`order_<id>`** (suivi client)
5. `notifications` consomme aussi `catalog.product.*` (`cnc.catalog.events`) → diffuse **`catalog.product.updated`** à tous les clients : le **stock affiché sur la carte se met à jour en direct** (réservation, libération, épuisement)
6. Côté cuisine (vue `/kitchen`) : bouton d'action rapide → `PATCH /api/orders/:id/status` → **PREPARING → READY** (+ `order.status_updated`)

## Frontend

Deux vues commutables depuis la barre de navigation :

| Vue | Route | Contenu |
|---|---|---|
| Client | `/` | Carte (stock en direct), panier interactif, validation avec prénom, écran de suivi `/order/:id` — barre de progression *En attente de paiement → Payée → En préparation → Prête au comptoir* mise à jour **sans recharger la page** |
| Cuisine | `/kitchen` | Kanban temps réel 3 colonnes (*Payées / À faire*, *En préparation*, *Prêtes au retrait*), nouvelles commandes instantanées, bouton d'action rapide par carte |

## Test rapide des services événementiels

```bash
# payment-service : traiter un paiement forcé (délai 2 s inclus)
curl -X POST http://localhost:8080/api/v1/payments/__test/process-payment \
  -H 'Content-Type: application/json' -d '{"forceOutcome":"failure"}'
# (activer TEST_ENDPOINTS=true dans .env, ou lancer en dev hors production)

# notification-service : client socket de test + publication simulée
npm run client:test --workspace @cnc/notification-service
npm run publish:test --workspace @cnc/notification-service -- \
  --orderId demo-123 --sequence PAID,PREPARING,READY

# payment-service : simuler des order.created (boucle complète via RabbitMQ)
npm run simulate --workspace @cnc/payment-service -- --count 3 --outcome random
```

## Commandes utiles

```bash
docker compose ps                        # état des conteneurs
docker compose logs -f orders-service    # logs d'un service
docker compose logs -f gateway           # logs du gateway (proxy, rate-limit)
docker compose restart catalog-service   # redémarrage d'un service
docker compose down                      # arrêt (-v : + effacement des données)

# Développement local hors Docker : voir « Démarrage pas à pas » plus haut.
```
