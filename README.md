# ☕ Click & Collect Express

Application complète en architecture **microservices événementiels** pour la commande de café & restauration rapide avec **suivi de préparation en temps réel** (WebSocket / Socket.io) et **mise à jour du stock en direct**.

---

## ⚡ Démarrage rapide en 1 clic (macOS / Desktop)

Le moyen le plus simple et recommandé pour lancer toute l'application sur votre machine :

### 1. Prérequis
- **Docker Desktop** (doit être installé et lancé sur votre ordinateur) : [Télécharger Docker Desktop](https://www.docker.com/products/docker-desktop)
- **Node.js** (v20 ou supérieure recommandée)

### 2. Lancement
Dans votre terminal à la racine du projet :

```bash
./run.sh
```

Ce script vérifie Docker, génère la configuration d'environnement `.env`, compile et démarre l'ensemble des **11 conteneurs** (4 bases PostgreSQL, RabbitMQ, 4 microservices, gateway, frontend) et ouvre automatiquement l'application dans votre navigateur !

---

## 🌐 Liens d'accès aux services

| Service | URL | Rôle |
|---|---|---|
| **Application Client (Carte & Commande)** | [http://localhost:5173](http://localhost:5173) | Consultation de la carte, stock en direct, panier, suivi de commande |
| **Écran Cuisine (Kanban temps réel)** | [http://localhost:5173/kitchen](http://localhost:5173/kitchen) | Gestion des commandes en préparation / prêtes avec actions rapides |
| **API Gateway (Health Check)** | [http://localhost:8080/health](http://localhost:8080/health) | Point d'entrée HTTP & WebSocket unique |
| **RabbitMQ Management UI** | [http://localhost:15672](http://localhost:15672) | Broker d'événements (login: `cnc_admin` / pass: `change_me_rabbit`) |

---

## 📦 Liste exacte des 11 conteneurs Docker

L'orchestration `docker-compose.yml` démarre **exactement 11 conteneurs** isolés et communicants :

| # | Nom du conteneur | Service / Rôle | Image | Ports exposés | Réseau |
|---|---|---|---|---|---|
| 1 | `cnc-frontend` | Interface utilisateur (SPA React 18 / Vite / Tailwind) | `nginx:1.27-alpine` | `5173:80` | `cnc_frontend` |
| 2 | `cnc-gateway` | Point d'entrée unique (Express, proxy REST & WebSocket) | Node 20 (custom) | `8080:8080` | `cnc_frontend`, `cnc_backend` |
| 3 | `cnc-catalog` | Microservice Catalogue (produits, stock atomique, Prisma) | Node 20 (custom) | 3001 *(interne)* | `cnc_backend` |
| 4 | `cnc-orders` | Microservice Commandes (machine à états, Saga) | Node 20 (custom) | 3002 *(interne)* | `cnc_backend` |
| 5 | `cnc-payment` | Microservice Paiement (simulation 2s, 90% succès ou Stripe) | Node 20 (custom) | 3003 *(interne)* | `cnc_backend` |
| 6 | `cnc-notifications` | Microservice Notifications (Hub Socket.io temps réel) | Node 20 (custom) | 3004 *(interne)* | `cnc_backend` |
| 7 | `cnc-rabbitmq` | Broker d'événements AMQP (Exchanges Topic + DLQ) | `rabbitmq:3.13-management-alpine` | `5672:5672`, `15672:15672` | `cnc_backend` |
| 8 | `cnc-catalog-db` | Base PostgreSQL dédiée au catalogue (`catalog_db`) | `postgres:16-alpine` | `127.0.0.1:5433:5432` *(debug)* | `cnc_backend` |
| 9 | `cnc-orders-db` | Base PostgreSQL dédiée aux commandes (`orders_db`) | `postgres:16-alpine` | `127.0.0.1:5434:5432` *(debug)* | `cnc_backend` |
| 10 | `cnc-payment-db` | Base PostgreSQL dédiée aux paiements (`payment_db`) | `postgres:16-alpine` | `127.0.0.1:5435:5432` *(debug)* | `cnc_backend` |
| 11 | `cnc-notifications-db` | Base PostgreSQL dédiée aux notifications (`notifications_db`) | `postgres:16-alpine` | `127.0.0.1:5436:5432` *(debug)* | `cnc_backend` |

---

## 🏗️ Architecture Technique

```
                              ┌────────────────────────────────────────┐
                              │  Frontend (React 18, Vite, Tailwind)   │
                              │       http://localhost:5173            │
                              └──────────────────┬─────────────────────┘
                                                 │
                                                 ▼
                              ┌────────────────────────────────────────┐
                              │   API Gateway (Express, Socket.io)     │
                              │       http://localhost:8080            │
                              └───────┬──────────────┬───────────┬─────┘
                                      │              │           │
                 ┌────────────────────┘              │           └────────────────────┐
                 ▼                                   ▼                                ▼
       ┌──────────────────┐                ┌──────────────────┐             ┌──────────────────┐
       │ catalog-service  │                │  orders-service  │             │  payment-service │
       │   (Port 3001)    │                │   (Port 3002)    │             │   (Port 3003)    │
       └────────┬─────────┘                └────────┬─────────┘             └────────┬─────────┘
                │                                   │                                │
                ▼                                   ▼                                ▼
       ┌──────────────────┐                ┌──────────────────┐             ┌──────────────────┐
       │    catalog_db    │                │    orders_db     │             │    payment_db    │
       │   (Port 5433)    │                │   (Port 5434)    │             │   (Port 5435)    │
       └──────────────────┘                └──────────────────┘             └──────────────────┘
                 │                                  │                                │
                 └──────────────────┬───────────────┴────────────────────────────────┘
                                    │  Événements AMQP
                                    ▼
                      ┌───────────────────────────┐
                      │    RabbitMQ (AMQP Broker) │
                      │    cnc.events (Topic)     │
                      └─────────────┬─────────────┘
                                    │
                                    ▼
                      ┌───────────────────────────┐
                      │   notifications-service   │
                      │  WebSocket Hub (Port 3004)│
                      └─────────────┬─────────────┘
                                    │
                                    ▼
                      ┌───────────────────────────┐
                      │    notifications_db       │
                      │       (Port 5436)         │
                      └───────────────────────────┘
```

---

## 🔄 Concurrence sur le stock et Cohérence éventuelle (Saga chorégraphiée)

Le système Click & Collect utilise le pattern **Saga avec chorégraphie d'événements** pour garantir l'intégrité du stock et des commandes même en cas de forte concurrence ou de pannes réseau :

### 1. Réservation atomique (Zéro sur-vente)
- Lorsque le client valide son panier, `orders-service` appelle `POST /products/reserve` sur `catalog-service`.
- `catalog-service` exécute un `UPDATE` conditionnel PostgreSQL dans une transaction ACID :
  ```sql
  UPDATE products
  SET stock = stock - requested_qty
  WHERE id = $id AND stock >= requested_qty;
  ```
- **Si 2 clients commandent le dernier café en même temps** : la transaction concurrente est sérialisée au niveau de la ligne PostgreSQL. Le premier client réussit, le stock passe à 0. Le second update ne matche aucune ligne (`P2025`), la transaction est annulée et renvoie immédiatement un code HTTP `409 STOCK_INSUFFICIENT`. Aucune commande n'est créée en base.

### 2. Saga de Paiement et Compensation
Si la réservation réussit, la commande est créée avec le statut **`PENDING`** :

```
Client              orders-service       catalog-service       payment-service       notifications (WS)
  │                        │                    │                     │                      │
  ├─ 1. POST /orders ─────►│                    │                     │                      │
  │                        ├─ 2. Reserve ──────►│                     │                      │
  │                        │◄─── Stock réservé ─┤                     │                      │
  │                        ├─ 3. Crée PENDING   │                     │                      │
  │                        ├─ 4. order.created (AMQP) ───────────────►│                      │
  │                        │                    │                     │ (Simule 2s débit)    │
  │                        │                    │                     │                      │
  │                        │◄── 5. payment.failed (AMQP) ─────────────┤                      │
  │                        │                    │                     │                      │
  │                        ├─ 6. Statut CANCELLED                     │                      │
  │                        ├─ 7. Compensation : Release items ───────►│                      │
  │                        │                    ├─ Restitue le stock  │                      │
  │                        │                    └─ catalog.product.updated (AMQP) ──────────►│
  │                        ├─ 8. order.status_updated (AMQP) ───────────────────────────────►│
  │                        │                    │                     │                      │
  │◄─ Réponse temps réel ──┴────────────────────┴─────────────────────┴──────────────────────┴─► Diffuse UI
```

- **Si le paiement échoue (ou délai dépassé)** : `payment-service` publie `payment.failed`. `orders-service` consomme l'événement, passe la commande à **`CANCELLED`** et déclenche immédiatement la **compensation** : `catalogClient.releaseItems(...)` ré-incrémente le stock dans le catalogue. Les écrans clients et cuisine sont notifiés en direct via WebSocket.

---

## 🛡️ Résilience du Broker RabbitMQ & du WebSocket

1. **Idempotence des consommateurs** :
   - Les messages RabbitMQ embarquent un identifiant unique `eventId` / `messageId`.
   - `orders-service` vérifie l'état actuel de la commande (`if order.status === 'PAID' return`) : si un message `payment.succeeded` est relivré après un redémarrage, il est acquitté immédiatement sans ré-exécuter le traitement.
   - `payment-service` dispose d'un store de transactions (`paymentStore.getByOrderId`) qui re-publie le résultat existant en cas de doublon sans re-débiter le client.
2. **Dead Letter Exchange (DLQ)** :
   - Toute exception non transitoire ou message corrompu est transféré vers une file `.dlq` pour inspection sans bloquer la chaîne de traitement.
3. **Reconnexion WebSocket automatique** :
   - Le client Socket.io est configuré avec `reconnection: true`, `reconnectionAttempts: Infinity` et backoff exponentiel.
   - En cas de micro-coupure réseau ou redémarrage du conteneur `gateway` / `notifications`, le client se reconnecte automatiquement et **rejoint automatiquement ses rooms actives** (`kitchen` et `order_<id>`).

---

## 🔒 Sécurité & Gestion des Secrets

> [!WARNING]
> Les identifiants par défaut présents dans `.env` (`cnc_admin`, `change_me_rabbit`, `change_me_pg`) sont **exclusivement réservés au développement local sur votre machine**. Ne les déployez JAMAIS en production.

### Bonnes pratiques pour un déploiement en production :
1. **Génération de mots de passe forts** :
   ```bash
   openssl rand -hex 24
   ```
2. **Isolation des bases de données** :
   - Les ports PostgreSQL `5433`, `5434`, `5435`, `5436` sont actuellement liés à `127.0.0.1` pour le débogage local. En production, supprimez la section `ports:` des bases de données dans `docker-compose.yml` : elles ne doivent être accessibles que sur le réseau Docker privé `cnc_backend`.
3. **Secrets Manager** :
   - Utilisez Docker Secrets, Kubernetes Secrets, AWS Secrets Manager ou HashiCorp Vault plutôt qu'un fichier `.env` sur le serveur.
4. **CORS & Rate Limiting** :
   - Remplacer `CORS_ORIGIN=*` par la liste exacte des noms de domaines de votre application.

---

## 🛠️ Commandes utiles

Toutes les commandes peuvent être exécutées directement depuis la racine :

```bash
# Démarrer tous les conteneurs en arrière-plan
npm run up

# Suivre les logs de tous les conteneurs en direct
npm run logs

# Vérifier l'état de santé de tous les conteneurs
npm run ps

# Arrêter l'application (les données des bases sont conservées)
npm run down

# Arrêter et réinitialiser complètement (efface les bases et RabbitMQ)
npm run clean

# Démarrer uniquement l'infrastructure (RabbitMQ + 4 bases Postgres)
npm run infra:up
```
