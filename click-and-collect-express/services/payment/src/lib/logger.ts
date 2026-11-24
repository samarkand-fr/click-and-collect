import pino from 'pino';
import { config } from '../config.js';

/** Logger structuré JSON (pino) — `docker compose logs payment-service`. */
export const logger = pino({
  level: config.logLevel,
  base: { service: config.serviceName, env: config.nodeEnv },
  timestamp: pino.stdTimeFunctions.isoTime,
});
