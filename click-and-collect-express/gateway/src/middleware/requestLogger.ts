// =====================================================================
//  Journal de requêtes — une ligne JSON par requête servie :
//  method, chemin, statut HTTP et durée. Les proxys en amont
//  (requestLogger des microservices) complètent la trace de bout en bout.
// =====================================================================
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger.js';

let counter = 0;

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = `gw_${Date.now().toString(36)}_${(counter++).toString(36)}`;
  const startedAt = process.hrtime.bigint();

  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](
      {
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
      },
      'Requête servie',
    );
  });

  next();
}
