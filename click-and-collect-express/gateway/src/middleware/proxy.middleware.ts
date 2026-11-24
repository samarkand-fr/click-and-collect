// =====================================================================
//  Proxy inverse central — routage par préfixe vers les microservices.
//
//  Public (client → gateway)                → Amont (gateway → service)
//  /api/products/**  (+ /api/v1/**)         → catalog-service     /products/**
//  /api/orders/**    (+ /api/v1/**)         → orders-service      /orders/**
//  /api/payments/**  (+ /api/v1/**)         → payment-service     /payments/**
//  /api/notifications/**                    → notifications-service (racine)
//  /socket.io/**  (HTTP + WebSocket)        → notifications-service /socket.io/**
//
//  Points clés :
//   - le dispatcher réécrit req.url LUI-MÊME (aucune magie de mount
//     Express) puis délègue à une instance de proxy par destination ;
//   - les erreurs amont (ECONNREFUSED, timeout...) sont converties en
//     JSON homogène { error: { code, message } } — jamais de HTML ;
//   - la montée WebSocket (/socket.io) est branchée sur server.on('upgrade')
//     dans src/index.ts (les requêtes upgrade ne passent PAS par Express).
// =====================================================================
import type { RequestHandler as ExpressRequestHandler } from 'express';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Socket as NetSocket } from 'node:net';
import { createProxyMiddleware, type RequestHandler } from 'http-proxy-middleware';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

/** Préfixe d'API public — /api et /api/v1 sont des alias (compat README). */
const API_PREFIX = /^\/api(\/v1)?/;

interface RouteRule {
  /** Étiquette de diagnostic (logs). */
  label: string;
  /** Préfixe public accepté (testé sur req.path — query string exclue). */
  match: RegExp;
  /** URL amont du microservice. */
  target: string;
  /** Préfixe à retirer du chemin avant transmission (null = tel quel). */
  strip: RegExp | null;
}

const rules: RouteRule[] = [
  {
    label: 'notifications',
    match: /^\/api(\/v1)?\/notifications(\/|$)/,
    target: config.notificationsUrl,
    strip: /^\/api(\/v1)?\/notifications/,
  },
  {
    label: 'payments',
    match: /^\/api(\/v1)?\/payments(\/|$)/,
    target: config.paymentUrl,
    strip: API_PREFIX,
  },
  {
    label: 'orders',
    match: /^\/api(\/v1)?\/orders(\/|$)/,
    target: config.ordersUrl,
    strip: API_PREFIX,
  },
  {
    label: 'catalog',
    match: /^\/api(\/v1)?\/products(\/|$)/,
    target: config.catalogUrl,
    strip: API_PREFIX,
  },
  {
    // Alias historique : /api/v1/catalog/products → /products (compat README v0.1)
    label: 'catalog-alias',
    match: /^\/api(\/v1)?\/catalog(\/|$)/,
    target: config.catalogUrl,
    strip: /^\/api(\/v1)?\/catalog/,
  },
  {
    label: 'socket.io',
    match: /^\/socket\.io(\/|$)/,
    target: config.notificationsUrl,
    strip: null, // chemin transmis tel quel (polling HTTP + WebSocket)
  },
];

/** Statut HTTP le plus honnête selon l'erreur amont. */
function upstreamStatus(err: Error): number {
  const code = (err as NodeJS.ErrnoException).code ?? '';
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') return 503; // service absent
  if (code === 'ETIMEDOUT' || code === 'ECONNRESET') return 504;   // amont trop lent
  return 502; // réponse invalide / autre
}

/** Corps d'erreur JSON homogène — le MÊME contrat que les microservices. */
function upstreamErrorBody(rule: RouteRule, err: Error): string {
  return JSON.stringify({
    error: {
      code: 'UPSTREAM_UNAVAILABLE',
      message: `Service « ${rule.label} » momentanément indisponible — réessayez plus tard`,
      details: { target: rule.target, upstreamCode: (err as NodeJS.ErrnoException).code },
    },
  });
}

/** Fabrique (et cache) une instance de proxy par destination. */
const proxyCache = new Map<string, RequestHandler>();

function getProxy(rule: RouteRule): RequestHandler {
  const cached = proxyCache.get(rule.target);
  if (cached) return cached;

  const proxy = createProxyMiddleware({
    target: rule.target,
    changeOrigin: false,
    ws: rule.label === 'socket.io',
    ...(rule.strip
      ? { pathRewrite: (path: string) => path.replace(rule.strip as RegExp, '') || '/' }
      : {}),
    proxyTimeout: config.proxyTimeoutMs,
    timeout: config.proxyTimeoutMs,
    on: {
      proxyReq: (proxyReq, req) => {
        logger.debug(
          { from: req.url, to: `${rule.target}${proxyReq.path}` },
          'Requête proxyfiée',
        );
      },
      // IMPORTANT : réponse d'erreur JSON homogène (le défaut de http-proxy
      // serait du HTML brut, incompatible avec le contrat d'API).
      error: (err, _req, res) => {
        const status = upstreamStatus(err);
        logger.error(
          { err, target: rule.target, label: rule.label },
          'Microservice amont en échec',
        );
        if (res instanceof NetSocket) {
          // Échec pendant une montée WebSocket : rien à répondre en HTTP.
          res.destroy();
          return;
        }
        if (res.headersSent) {
          res.end();
          return;
        }
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(upstreamErrorBody(rule, err));
      },
    },
  });

  proxyCache.set(rule.target, proxy);
  return proxy;
}

/** Middleware Express : résout la règle, réécrit req.url, proxifie. */
export const proxyRouter: ExpressRequestHandler = (req, res, next) => {
  const rule = rules.find((candidate) => candidate.match.test(req.path));
  if (!rule) {
    next(); // aucune route connue → notFoundHandler JSON
    return;
  }

  if (rule.strip) {
    // req.url = chemin + query string ; la règle est ancrée au début
    // donc la query string est préservée (ex : ?status=PAID).
    req.url = req.url.replace(rule.strip, '') || '/';
  }

  getProxy(rule)(req as IncomingMessage, res as ServerResponse, next);
};

/**
 * Montée WebSocket : branchée sur server.on('upgrade') — les requêtes
 * `Upgrade: websocket` ne traversent PAS la pile Express. Seule /socket.io
 * est autorisée ; toute autre montée est détruite (sécurité).
 */
export function socketUpgradeHandler(
  req: IncomingMessage,
  socket: NetSocket,
  head: Buffer,
): void {
  const url = req.url ?? '/';
  const rule = rules.find(
    (candidate) => candidate.label === 'socket.io' && candidate.match.test(url),
  );
  if (!rule) {
    logger.warn({ url }, 'Montage WebSocket refusé (route inconnue)');
    socket.destroy();
    return;
  }
  getProxy(rule).upgrade(req, socket, head);
}
