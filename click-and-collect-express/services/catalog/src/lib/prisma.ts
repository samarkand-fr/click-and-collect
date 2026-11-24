import { PrismaClient } from '../generated/prisma/index.js';

/**
 * Singleton Prisma — un seul pool de connexions PostgreSQL par process.
 * Client généré localement (src/generated/prisma) depuis prisma/schema.prisma.
 */
export const prisma = new PrismaClient({
  log: ['warn', 'error'],
});
