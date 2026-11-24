# Image du frontend Click & Collect Express : build Vite puis service Nginx.
# Contexte de build attendu : racine du monorepo (docker compose / docker build -f frontend/Dockerfile .)

# Étape 1 : build de l'application (tsc -b && vite build → dist/)
FROM node:20-alpine AS build
WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# Étape 2 : serveur Nginx (SPA + proxy /api et /socket.io vers la passerelle)
FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
