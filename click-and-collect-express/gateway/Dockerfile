# =====================================================================
#  API Gateway — image de production (multi-stage)
#  Contexte de build : racine du monorepo
#    docker build -f gateway/Dockerfile .
# =====================================================================

# ── Étape 1 : installation des dépendances + compilation TypeScript ─────────
FROM node:20-alpine AS build
WORKDIR /app

# Manifestes d'abord : maximise le cache Docker
COPY tsconfig.base.json ./
COPY gateway/package.json gateway/tsconfig.json ./gateway/
WORKDIR /app/gateway
RUN npm install --no-audit --no-fund

# Code source (le cache npm des étapes précédentes est préservé)
WORKDIR /app
COPY gateway ./gateway
WORKDIR /app/gateway
RUN npm run build

# ── Étape 2 : image d'exécution minimale ─────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app/gateway
ENV NODE_ENV=production

COPY --from=build --chown=node:node /app/gateway/node_modules ./node_modules
COPY --from=build --chown=node:node /app/gateway/dist ./dist
COPY --from=build --chown=node:node /app/gateway/package.json ./package.json

LABEL org.opencontainers.image.title="click-and-collect/gateway" \
      org.opencontainers.image.description="API Gateway : proxy REST + WebSocket, CORS, rate-limiting, erreurs JSON"

USER node
EXPOSE 8080
CMD ["node", "dist/src/index.js"]
