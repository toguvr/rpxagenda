import { Prisma } from '@prisma/client';
import type { ClsService } from 'nestjs-cls';
import { CLS_KEYS } from '../common/cls/cls-keys';

/**
 * Modelos que carregam `unitId` e devem ser automaticamente filtrados pela unidade
 * do usuário autenticado. Cada feature da Fase 1+ que adiciona um modelo multi-unit
 * registra-o aqui.
 *
 * `User` é intencionalmente omitido porque o módulo auth precisa buscar usuários por
 * email/id sem conhecimento prévio de unidade (login).
 */
export const UNIT_SCOPED_MODELS = new Set<string>([
  // Fase 1+ irá adicionar: 'Service', 'Equipment', 'Professional', 'Patient'
]);

/**
 * Operações de leitura que recebem `where` e podem ser auto-filtradas com segurança.
 */
const READ_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);

/**
 * Operações de escrita que recebem `where`. Auto-filtramos para evitar update/delete
 * cross-tenant. `create` é tratado separadamente (validamos `data.unitId`).
 */
const WRITE_OPERATIONS = new Set(['update', 'updateMany', 'delete', 'deleteMany', 'upsert']);

interface WhereArgs {
  where?: Record<string, unknown>;
}
interface CreateArgs {
  data?: Record<string, unknown> | Array<Record<string, unknown>>;
}

function injectUnitId(args: WhereArgs | undefined, unitId: string): WhereArgs {
  const base = args ?? {};
  return {
    ...base,
    where: {
      ...(base.where ?? {}),
      unitId,
    },
  };
}

function validateCreateUnitId(args: CreateArgs | undefined, unitId: string, model: string): void {
  if (!args?.data) return;
  const rows = Array.isArray(args.data) ? args.data : [args.data];
  for (const row of rows) {
    const supplied = row['unitId'];
    if (supplied === undefined) {
      row['unitId'] = unitId;
      continue;
    }
    if (supplied !== unitId) {
      throw new Error(
        `[unit-scope] tentativa de criar ${model} com unitId="${String(supplied)}" ` +
          `diferente do contexto atual ("${unitId}").`,
      );
    }
  }
}

/**
 * Factory da extensão Prisma. Lê unitId do CLS no momento de cada query e injeta
 * `where.unitId` para modelos escopados. Quando rodando fora de um request (jobs,
 * seed, repl), CLS não tem unitId e a extensão se torna no-op.
 *
 * Opt-out: chamar dentro de `cls.runWith({ [SKIP_UNIT_SCOPE]: true }, fn)` ou usar
 * a flag passada ao construir a extensão para um Prisma raw.
 */
export function buildUnitScopeExtension(cls: ClsService) {
  return Prisma.defineExtension({
    name: 'rpx-unit-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!UNIT_SCOPED_MODELS.has(model)) {
            return query(args);
          }
          const skip = cls.isActive() ? cls.get<boolean>(CLS_KEYS.SKIP_UNIT_SCOPE) : false;
          if (skip) {
            return query(args);
          }
          const unitId = cls.isActive() ? cls.get<string>(CLS_KEYS.UNIT_ID) : undefined;
          if (!unitId) {
            return query(args);
          }
          if (READ_OPERATIONS.has(operation) || WRITE_OPERATIONS.has(operation)) {
            return query(injectUnitId(args as WhereArgs, unitId));
          }
          if (operation === 'create' || operation === 'createMany') {
            validateCreateUnitId(args as CreateArgs, unitId, model);
            return query(args);
          }
          return query(args);
        },
      },
    },
  });
}
