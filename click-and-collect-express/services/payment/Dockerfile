# =====================================================================
#  payment-service — image de production (multi-stage)
#  Contexte de build : racine du monorepo
#    docker build -f services/payment/Dockerfile .
# =====================================================================

# ── Étape 1 : installation des dépendances + compilation TypeScript ─────────
FROM node:20-alpine AS build
WORKDIR /app

# Manifestes d'abord : maximise le cache Docker
COPY tsconfig.base.json ./
COPY services/payment/package.json services/payment/tsconfig.json ./services/payment/

WORKDIR /app/services/payment
RUN npm install --no-audit --no-fund

# Code source (le cache npm des étapes précédentes est préservé)
WORKDIR /app
COPY services/payment ./services/payment

# Compilation TypeScript → dist/
WORKDIR /app/services/payment
RUN npm run build

# ── Étape 2 : image d'exécution minimale ─────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app/services/payment
ENV NODE_ENV=production

COPY --from=build --chown=node:node /app/services/payment/node_modules ./node_modules
COPY --from=build --chown=node:node /app/services/payment/dist ./dist
COPY --from=build --chown=node:node /app/services/payment/package.json ./package.json

LABEL org.opencontainers.image.title="click-and-collect/payment-service" \
      org.opencontainers.image.description="Microservice paiement : simulation 2 s (90/10 contrôlable), publication payment.succeeded / payment.failed"

USER node
EXPOSE 3003
CMD ["node", "dist/src/index.js"]
