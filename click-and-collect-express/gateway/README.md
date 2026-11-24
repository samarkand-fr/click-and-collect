# API Gateway — Click & Collect Express

Point d'entrée **HTTP/WS unique** du système (`http://localhost:8080`). Le frontend
et tout client externe ne parlent qu'à ce service ; les microservices ne publient
aucun port hôte.

## Pile technique

| Rôle | Choix |
|---|---|
| Serveur HTTP | Express 5 (Node.js 20, TypeScript) |
| Proxy inverse | http-proxy-middleware v3 (HTTP + WebSocket `ws: true`) |
| Rate-limiting | express-rate-limit (fenêtre fixe par IP, JSON 429) |
| CORS | `cors` — `CORS_ORIGIN=*` en dev, liste CSV en prod |
| Erreurs | JSON homogène `{ error: { code, message, details? } }` partout |
| Logs | pino (JSON structuré) |

## Routage

| Requête publique | Destination | Chemin amont |
|---|---|---|
| `GET /api/products/**` | catalog-service :3001 | `/products/**` |
| `POST /api/orders`, `GET /api/orders/**`, `PATCH /api/orders/:id/status` | orders-service :3002 | `/orders/**` |
| `GET /api/payments/:orderId` | payment-service :3003 | `/payments/:orderId` |
| `GET /api/notifications/**` | notifications-service :3004 | `/events/recent`, `/realtime/stats` |
| `WS /socket.io/**` (polling + upgrade) | notifications-service :3004 | `/socket.io/**` |

`/api/v1/**` est un **alias** strictement équivalent de `/api/**`.

- Le préfixe `/api` est retiré avant transmission (ex : `/api/orders/42` →
  `GET /orders/42` sur orders-service) ; la query string est préservée.
- La montée WebSocket est branchée sur `server.on('upgrade')` : toute
  montée hors `/socket.io` est rejetée.
- Amont indisponible → `503`/`504` JSON `UPSTREAM_UNAVAILABLE` (jamais de HTML).

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `8080` | Port d'écoute |
| `CATALOG_URL` | — (requis) | `http://catalog-service:3001` |
| `ORDERS_URL` | — (requis) | `http://orders-service:3002` |
| `PAYMENT_URL` | — (requis) | `http://payment-service:3003` |
| `NOTIFICATIONS_URL` | — (requis) | `http://notifications-service:3004` |
| `CORS_ORIGIN` | `*` | Origines autorisées (CSV en prod) |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Fenêtre du rate-limit |
| `RATE_LIMIT_MAX` | `120` | Requêtes max par IP et par fenêtre |
| `PROXY_TIMEOUT_MS` | `15000` | Timeout vers chaque microservice |

## Développement local

```bash
# depuis la racine du monorepo, gateway seul :
CATALOG_URL=http://localhost:3001 \
ORDERS_URL=http://localhost:3002 \
PAYMENT_URL=http://localhost:3003 \
NOTIFICATIONS_URL=http://localhost:3004 \
npm run dev -w gateway
```

En production : `docker compose up -d --build` — le service `gateway` attend
que les 4 microservices soient `healthy` avant de démarrer.
