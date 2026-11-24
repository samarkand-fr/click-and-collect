#!/usr/bin/env bash
# =============================================================================
#  Click & Collect Express — Script de lancement rapide sur Desktop (macOS / Linux)
# =============================================================================
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$DIR/click-and-collect-express"

echo "☕ [Click & Collect Express] Vérification des prérequis..."

# 1. Vérification de Docker
if ! command -v docker &> /dev/null; then
  echo "❌ Erreur: Docker n'est pas installé."
  echo "👉 Téléchargez et installez Docker Desktop : https://www.docker.com/products/docker-desktop"
  exit 1
fi

# 2. Vérification du démon Docker
if ! docker info &> /dev/null; then
  echo "⚠️ Le démon Docker n'est pas démarré."
  echo "👉 Veuillez lancer l'application Docker Desktop sur votre Mac, puis relancez ce script."
  exit 1
fi

echo "✅ Docker est prêt."

# 3. Vérification du fichier d'environnement
if [ ! -f "$APP_DIR/.env" ]; then
  echo "⚙️ Création du fichier .env à partir de .env.example..."
  if [ -f "$APP_DIR/.env.example" ]; then
    cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  else
    cat << 'EOF' > "$APP_DIR/.env"
POSTGRES_USER=cnc
POSTGRES_PASSWORD=change_me_pg
RABBITMQ_USER=cnc_admin
RABBITMQ_PASSWORD=change_me_rabbit
CORS_ORIGIN=*
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120
PROXY_TIMEOUT_MS=15000
PAYMENT_PROVIDER=mock
PAYMENT_PROCESSING_MS=2000
PAYMENT_SUCCESS_RATE=0.9
TEST_ENDPOINTS=true
SEED_ON_BOOT=true
SMTP_URL=
EOF
  fi
fi

# 4. Lancement de la stack via Docker Compose
echo "🚀 Démarrage des conteneurs (bases de données, RabbitMQ, microservices, passerelle, frontend)..."
cd "$APP_DIR"
docker compose up -d --build

echo "⏳ Attente de la disponibilité des services (environ 15-30s)..."
for i in {1..30}; do
  if curl -s http://localhost:8080/health > /dev/null 2>&1; then
    echo "✅ API Gateway opérationnelle !"
    break
  fi
  sleep 2
done

echo ""
echo "🎉 Application prête !"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 Application Web (Client)  : http://localhost:5173"
echo "👨‍🍳 Écran Cuisine (Kanban)    : http://localhost:5173/kitchen"
echo "🚪 API Gateway Health         : http://localhost:8080/health"
echo "🐰 RabbitMQ Management UI     : http://localhost:15672 (user: cnc_admin / pass: change_me_rabbit)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "ℹ️ Pour voir les logs en continu : npm run logs"
echo "ℹ️ Pour arrêter l'application   : npm run down"
echo ""

# Ouverture automatique dans le navigateur par défaut (macOS / Linux)
if [[ "$OSTYPE" == "darwin"* ]]; then
  open "http://localhost:5173"
elif command -v xdg-open &> /dev/null; then
  xdg-open "http://localhost:5173"
fi
