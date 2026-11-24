#!/bin/sh
# =====================================================================
#  Entrypoint du conteneur catalog-service
#  1. Applique les migrations Prisma versionnées (prisma migrate deploy)
#  2. Lance le serveur — le seed idempotent est géré par l'application
#     (SEED_ON_BOOT, activé par défaut)
# =====================================================================
set -e

echo "[catalog-service] Application des migrations Prisma..."
./node_modules/.bin/prisma migrate deploy

echo "[catalog-service] Démarrage du serveur..."
exec "$@"
