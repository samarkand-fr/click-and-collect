# =====================================================================
#  catalog-service — image de production (multi-stage)
#  Contexte de build : racine du monorepo
#    docker build -f services/catalog/Dockerfile .
# =====================================================================

# ── Étape 1 : installation des dépendances + compilation TypeScript ─────────
FROM node:20-alpine AS build
WORKDIR /app

# Manifestes + schéma Prisma d'abord : maximise le cache Docker
COPY tsconfig.base.json ./
COPY services/catalog/package.json services/catalog/tsconfig.json ./services/catalog/
COPY services/catalog/prisma ./services/catalog/prisma

WORKDIR /app/services/catalog
RUN npm install --no-audit --no-fund

# Code source (le cache npm des étapes précédentes est préservé)
WORKDIR /app
COPY services/catalog ./services/catalog

# Génération du client Prisma (output src/generated) + build TS + copie du
# client généré dans dist — tsc n'embarque pas les assets .js
WORKDIR /app/services/catalog
RUN npx prisma generate && npm run build && cp -R src/generated dist/src/generated

# ── Étape 2 : image d'exécution minimale ─────────────────────────────────────
FROM node:20-alpine AS runtime

# Prisma sur Alpine : dépendances natives (moteurs musl + TLS)
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app/services/catalog
ENV NODE_ENV=production

COPY --from=build --chown=node:node /app/services/catalog/node_modules ./node_modules
COPY --from=build --chown=node:node /app/services/catalog/dist ./dist
COPY --from=build --chown=node:node /app/services/catalog/prisma ./prisma
COPY --from=build --chown=node:node /app/services/catalog/package.json ./package.json

# Entrypoint : migration du schéma au boot, puis lancement du serveur
COPY services/catalog/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

LABEL org.opencontainers.image.title="click-and-collect/catalog-service" \
      org.opencontainers.image.description="Microservice catalogue : produits, stock, réservation atomique"

USER node
EXPOSE 3001
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/src/index.js"]
