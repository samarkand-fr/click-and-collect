// =====================================================================
//  Rate-limiting basique par IP (fenêtre fixe) — première barrière de
//  protection du point d'entrée unique. La sonde /health est exclue
//  pour ne pas fausser les healthchecks Docker.
// =====================================================================
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

export const globalRateLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  limit: config.rateLimitMax,
  standardHeaders: 'draft-7', // RateLimit-Policy / RateLimit-Limit / -Remaining
  legacyHeaders: false,
  skip: (req) => req.path === '/health',
  handler: (_req, res) => {
    logger.warn({ windowMs: config.rateLimitWindowMs, limit: config.rateLimitMax }, 'Rate-limit atteint');
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Trop de requêtes — réessayez dans un instant',
        details: {
          windowMs: config.rateLimitWindowMs,
          max: config.rateLimitMax,
        },
      },
    });
  },
});
