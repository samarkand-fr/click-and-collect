# catalog-service

Microservice catalogue du monorepo **Click & Collect Express** — produits, stock et réservation atomique.
Port interne : `3001` · Base : `catalog_db` (PostgreSQL, isolée) · Exchange : `cnc.catalog.events`.

## Endpoints

| Méthode | Route                | Description                                                                 | Codes |
|---------|----------------------|-----------------------------------------------------------------------------|-------|
| GET     | `/health`            | Sonde de vie (healthcheck docker-compose)                                    | 200   |
| GET     | `/products`          | Liste — disponibles uniquement par défaut. Query : `?category=coffee&search=latte&includeUnavailable=true` | 200 |
| GET     | `/products/:id`      | Détail d'un produit                                                          | 200 · 404 |
| POST    | `/products`          | Création (back-office)                                                       | 201 · 400 · 409 |
| POST    | `/products/reserve`  | Décrément atomique du stock (appelé par orders-service)                      | 200 · 400 · 404 · **409** |
| POST    | `/products/release`  | Ré-incrément du stock — annulation ou échec de paiement (compensation saga)  | 200 |

> Le gateway expose ces routes publiquement sous `/api/v1/catalog/**`.

## Exemples

```bash
# Liste des produits disponibles
curl http://localhost:3001/products

# Création (prix en centimes)
curl -X POST http://localhost:3001/products -H 'Content-Type: application/json' -d '{
  "name": "Matcha Latte", "price": 490, "category": "coffee", "stock": 30
}'

# Réservation atomique + vérification des prix — 409 si stock insuffisant,
# produit indisponible, ou expectedPrice divergent du prix du catalogue
curl -X POST http://localhost:3001/products/reserve -H 'Content-Type: application/json' -d '{
  "items": [{ "productId": "<id>", "quantity": 2, "expectedPrice": 380 }]
}'

# Libération (compensation)
curl -X POST http://localhost:3001/products/release -H 'Content-Type: application/json' -d '{
  "items": [{ "productId": "<id>", "quantity": 2 }]
}'
```

## Développement local

```bash
docker compose up -d catalog-db           # base PostgreSQL du service
npm install                               # à la racine du monorepo
npm run db:migrate -w services/catalog    # applique les migrations (ou db:push en dev)
npm run dev -w services/catalog           # tsx watch → http://localhost:3001
```

## Variables d'environnement

| Variable          | Requis | Défaut                | Rôle                                        |
|-------------------|--------|-----------------------|---------------------------------------------|
| `DATABASE_URL`    | oui    | —                     | PostgreSQL (catalog_db)                     |
| `PORT`            | non    | 3001                  | Port d'écoute HTTP                          |
| `RABBITMQ_URL`    | non    | —                     | Si absent : événements désactivés           |
| `CATALOG_EXCHANGE`| non    | `cnc.catalog.events`  | Exchange topic des événements               |
| `SEED_ON_BOOT`    | non    | true                  | Seed des 6 produits au démarrage            |
| `LOG_LEVEL`       | non    | info (debug en dev)   | Niveau pino                                 |

## Garanties de cohérence

- **Réservation atomique** : transaction Prisma + UPDATE conditionnel (`WHERE stock >= quantité`)
  → jamais de stock négatif ni de sur-vente, même sous forte concurrence ; conflit → `409` avec
  le détail par article (`reason: insufficient_stock | unavailable`).
- **Compensation saga** : `/products/release` ré-incrément le stock après annulation ou échec de
  paiement ; un produit supprimé entre-temps est renvoyé dans `skipped` sans bloquer.
- **Seed idempotent** : upsert par nom unique — redémarrages sans doublon, stock préservé.
- **Événements** : `catalog.product.created` et `catalog.product.availability_changed` publiés
  (routing key = type d'événement) sur l'exchange topic — consommés par notifications-service.
- **Résilience broker** : reconnexion automatique avec backoff ; le service HTTP reste pleinement
  opérationnel même si RabbitMQ est hors ligne.
