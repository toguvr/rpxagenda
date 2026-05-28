/**
 * Chaves de CLS (AsyncLocalStorage por request) usadas para propagar contexto
 * de tenant para camadas baixas (ex: extensão Prisma de unit-scope).
 */
export const CLS_KEYS = {
  UNIT_ID: 'unitId',
  USER_ID: 'userId',
  /** Papel do usuário autenticado (ADMIN | PROFESSIONAL | PATIENT). */
  ROLE: 'role',
  /** Se true, a extensão Prisma de unit-scope ignora a injeção automática. */
  SKIP_UNIT_SCOPE: 'skipUnitScope',
} as const;
