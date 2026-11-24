import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '../generated/prisma/index.js';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { config } from '../config.js';

/** Dernier maillon du router : aucune route n'a répondu. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route inconnue : ${req.method} ${req.originalUrl}`,
    },
  });
}

/**
 * Convertit toute erreur en réponse JSON homogène :
 *   { error: { code, message, details? } }
 * (Express 5 transmet automatiquement les rejets des handlers async ici.)
 */
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
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

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Corps de requête invalide',
        details: err.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        error: {
          code: 'ALREADY_EXISTS',
          message: 'Enregistrement en conflit avec une contrainte unique',
          details: err.meta,
        },
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Enregistrement introuvable' },
      });
      return;
    }
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
