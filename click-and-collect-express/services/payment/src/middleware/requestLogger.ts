import type { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger.js';

/** Log structuré d'une requête : méthode, route, statut, durée. */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info(
      {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(durationMs),
      },
      'requête HTTP',
    );
  });

  next();
}
