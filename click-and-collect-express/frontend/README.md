# Click & Collect Express — Frontend

Application cliente du démonstrateur « Click & Collect Express » : commande de boissons et snacks en ligne, suivi temps réel et vue cuisine.

## Stack

React 18 · TypeScript (strict) · Vite 5 · Tailwind CSS 3.4 · react-router-dom 6 · socket.io-client 4 · lucide-react.

## Fonctionnalités

- **Carte** (`/`) : produits groupés par catégorie, stock temps réel (Socket.io), panier (sidebar desktop / bottom-sheet mobile), commande avec prénom.
- **Suivi** (`/order/:id`) : barre de progression 4 étapes, mise à jour temps réel du statut, récapitulatif.
- **Cuisine** (`/kitchen`) : kanban 3 colonnes (Payées / À faire, En préparation, Prêtes au retrait) avec actions optimistes.

## Démarrage

```bash
npm install
npm run dev      # http://localhost:5173
```

En dev, Vite proxifie `/api` et `/socket.io` vers la passerelle `http://localhost:8080` (WebSocket activé). Le code applicatif n'utilise que des chemins relatifs — aucune URL codée en dur.

## Build production

```bash
npm run build    # tsc -b && vite build → dist/
npm run preview
```

## Docker (contexte = racine du monorepo)

```bash
docker compose build frontend
# ou : docker build -f frontend/Dockerfile -t cce-frontend .
```

Nginx sert la SPA et proxifie `/api` et `/socket.io` vers `http://gateway:8080`.
