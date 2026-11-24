#!/bin/sh
# =====================================================================
#  Entrypoint du conteneur order-service
#  1. Applique les migrations Prisma versionnées (prisma migrate deploy)
#  2. Lance le serveur (broker RabbitMQ : connexion + consommation)
# =====================================================================
set -e

echo "[order-service] Application des migrations Prisma..."
./node_modules/.bin/prisma migrate deploy

echo "[order-service] Démarrage du serveur..."
exec "$@"
