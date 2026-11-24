// =====================================================================
//  Gestion d'erreurs unifiée — TOUTES les réponses d'erreur du gateway
//  (404 interne, rate-limit, amont indisponible, erreur inattendue)
//  partagent le même contrat JSON : { error: { code, message, details? } }.
// =====================================================================
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { config } from '../config.js';

/** Dernier maillon du router : aucune règle de proxy n'a accepté la requête. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route inconnue : ${req.method} ${req.originalUrl}`,
      details: {
        hint: 'Routes publiques : /api/products, /api/orders, /api/payments, /api/notifications, /socket.io',
      },
    },
  });
}

/** Convertit toute erreur non interceptée en réponse JSON homogène. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    _next(err);
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  logger.error({ err, path: req.originalUrl }, 'Erreur interne non gérée');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Erreur interne du serveur',
      ...(config.isProd ? {} : { details: String(err) }),
    },
  });
}
