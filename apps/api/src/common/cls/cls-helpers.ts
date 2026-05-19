import type { ClsService } from 'nestjs-cls';
import { CLS_KEYS } from './cls-keys';

/**
 * Executa `fn` com o flag de SKIP_UNIT_SCOPE ligado, permitindo a queries
 * Prisma ignorarem a injeção automática de `where.unitId`. Use com parcimônia,
 * apenas para operações comprovadamente cross-tenant (ex: relatórios globais
 * disparados por job, ou rotinas administrativas).
 */
export async function runWithoutUnitScope<T>(cls: ClsService, fn: () => Promise<T>): Promise<T> {
  if (!cls.isActive()) {
    return fn();
  }
  const previous = cls.get<boolean>(CLS_KEYS.SKIP_UNIT_SCOPE);
  cls.set(CLS_KEYS.SKIP_UNIT_SCOPE, true);
  try {
    return await fn();
  } finally {
    cls.set(CLS_KEYS.SKIP_UNIT_SCOPE, previous ?? false);
  }
}
