/**
 * Erreurs métier transportant leur code HTTP — converties en JSON homogène
 * par le middleware d'erreurs global (src/middleware/error.middleware.ts).
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Requête invalide', details?: unknown) {
    super(400, 'BAD_REQUEST', message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Ressource introuvable', details?: unknown) {
    super(404, 'NOT_FOUND', message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflit avec l\'état actuel de la ressource', details?: unknown) {
    super(409, 'CONFLICT', message, details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporairement indisponible', details?: unknown) {
    super(503, 'SERVICE_UNAVAILABLE', message, details);
  }
}
