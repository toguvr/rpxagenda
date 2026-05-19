import { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
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
  'Service',
  'Equipment',
  'Professional',
  'Patient',
  'Plan',
  'BusinessHours',
  'ScheduleException',
]);

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

const WHERE_WRITE_OPERATIONS = new Set(['update', 'updateMany', 'delete', 'deleteMany', 'upsert']);

interface WhereArgs {
  where?: Record<string, unknown>;
}
interface CreateArgs {
  data?: Record<string, unknown> | Array<Record<string, unknown>>;
}

export interface UnitScopeContext {
  unitId: string | undefined;
  skip: boolean;
}

/**
 * Núcleo testável: dada uma operação e seu contexto de tenant, retorna os args
 * efetivamente aplicados (com `where.unitId` injetado em reads/writes que aceitam
 * `where`, ou com validação de `data.unitId` em creates).
 *
 * Pode lançar erro em criação cross-tenant; nesse caso a operação NÃO deve ser
 * executada.
 */
export function applyUnitScope(
  model: string,
  operation: string,
  args: unknown,
  ctx: UnitScopeContext,
): unknown {
  if (!UNIT_SCOPED_MODELS.has(model)) return args;
  if (ctx.skip || !ctx.unitId) return args;

  if (READ_OPERATIONS.has(operation) || WHERE_WRITE_OPERATIONS.has(operation)) {
    const base = (args as WhereArgs | undefined) ?? {};
    return {
      ...base,
      where: { ...(base.where ?? {}), unitId: ctx.unitId },
    };
  }

  if (operation === 'create' || operation === 'createMany') {
    const a = (args as CreateArgs | undefined) ?? {};
    if (!a.data) return args;
    const rows = Array.isArray(a.data) ? a.data : [a.data];
    for (const row of rows) {
      const supplied = row['unitId'];
      if (supplied === undefined) {
        row['unitId'] = ctx.unitId;
      } else if (supplied !== ctx.unitId) {
        throw new Error(
          `[unit-scope] tentativa de criar ${model} com unitId="${String(supplied)}" ` +
            `diferente do contexto atual ("${ctx.unitId}").`,
        );
      }
    }
    return args;
  }

  return args;
}

/**
 * Factory da extensão Prisma. Lê unitId do CLS no momento de cada query e injeta
 * `where.unitId` para modelos escopados. Quando rodando fora de um request (jobs,
 * seed, repl), CLS não tem unitId e a extensão se torna no-op.
 *
 * Opt-out: ativar `CLS_KEYS.SKIP_UNIT_SCOPE` no contexto (ver `runWithoutUnitScope`).
 */
export function buildUnitScopeExtension(cls: ClsService) {
  return Prisma.defineExtension({
    name: 'rpx-unit-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const ctx: UnitScopeContext = {
            unitId: cls.isActive() ? cls.get<string>(CLS_KEYS.UNIT_ID) : undefined,
            skip: cls.isActive() ? !!cls.get<boolean>(CLS_KEYS.SKIP_UNIT_SCOPE) : false,
          };
          const scopedArgs = applyUnitScope(model, operation, args, ctx);
          return query(scopedArgs as never);
        },
      },
    },
  });
}
