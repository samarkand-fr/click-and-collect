# =====================================================================
#  notification-service — image de production (multi-stage)
#  Contexte de build : racine du monorepo
#    docker build -f services/notifications/Dockerfile .
# =====================================================================

# ── Étape 1 : installation des dépendances + compilation TypeScript ─────────
FROM node:20-alpine AS build
WORKDIR /app

# Manifestes d'abord : maximise le cache Docker
COPY tsconfig.base.json ./
COPY services/notifications/package.json services/notifications/tsconfig.json ./services/notifications/

WORKDIR /app/services/notifications
RUN npm install --no-audit --no-fund

# Code source (le cache npm des étapes précédentes est préservé)
WORKDIR /app
COPY services/notifications ./services/notifications

# Compilation TypeScript → dist/
WORKDIR /app/services/notifications
RUN npm run build

# ── Étape 2 : image d'exécution minimale ─────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app/services/notifications
ENV NODE_ENV=production

COPY --from=build --chown=node:node /app/services/notifications/node_modules ./node_modules
COPY --from=build --chown=node:node /app/services/notifications/dist ./dist
COPY --from=build --chown=node:node /app/services/notifications/package.json ./package.json

LABEL org.opencontainers.image.title="click-and-collect/notification-service" \
      org.opencontainers.image.description="Microservice notifications : Socket.io (rooms kitchen / order_<id>) alimenté par order.status_updated"

USER node
EXPOSE 3004
CMD ["node", "dist/src/index.js"]
