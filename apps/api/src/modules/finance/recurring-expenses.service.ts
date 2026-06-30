import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { fromZonedTime } from 'date-fns-tz';
import type {
  CreateRecurringExpenseRequest,
  ExpenseResponse,
  GenerateRecurringExpenseResponse,
  RecurringExpenseResponse,
  UpdateRecurringExpenseRequest,
} from '@rpx/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CLS_KEYS } from '../../common/cls/cls-keys';
import { ResourceNotFoundException } from '../../common/exceptions/app.exception';

type RecurringRow = Prisma.RecurringExpenseGetPayload<object>;
type ExpenseRow = Prisma.ExpenseGetPayload<object>;

/**
 * Gastos fixos (despesas recorrentes). CRUD pelo admin + um job diário que
 * materializa a despesa de cada gasto fixo no `dayOfMonth` (idempotente por mês
 * via unique `(recurringExpenseId, period)`). Valores variáveis usam o valor do
 * template como padrão e podem ser ajustados na despesa gerada.
 */
@Injectable()
export class RecurringExpensesService {
  private readonly logger = new Logger(RecurringExpensesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  // ---------- CRUD (contexto autenticado: scoped por unidade) ----------

  async create(data: CreateRecurringExpenseRequest): Promise<RecurringExpenseResponse> {
    const row = await this.prisma.scoped.recurringExpense.create({
      data: {
        category: data.category,
        amountCents: data.amountCents,
        dayOfMonth: data.dayOfMonth,
        variableAmount: data.variableAmount,
        active: data.active,
        description: data.description ?? null,
        notes: data.notes ?? null,
        createdById: this.actorId(),
      } as unknown as Prisma.RecurringExpenseUncheckedCreateInput,
    });
    await this.audit('RECURRING_EXPENSE_CREATED', row.id, null, this.snap(row));
    return this.map(row);
  }

  async findMany(): Promise<RecurringExpenseResponse[]> {
    const rows = await this.prisma.scoped.recurringExpense.findMany({
      orderBy: [{ active: 'desc' }, { dayOfMonth: 'asc' }],
    });
    return rows.map((r) => this.map(r));
  }

  async update(id: string, data: UpdateRecurringExpenseRequest): Promise<RecurringExpenseResponse> {
    const existing = await this.prisma.scoped.recurringExpense.findFirst({ where: { id } });
    if (!existing) throw new ResourceNotFoundException('Gasto fixo');

    const patch: Prisma.RecurringExpenseUncheckedUpdateInput = {};
    if (data.category !== undefined) patch.category = data.category;
    if (data.amountCents !== undefined) patch.amountCents = data.amountCents;
    if (data.dayOfMonth !== undefined) patch.dayOfMonth = data.dayOfMonth;
    if (data.variableAmount !== undefined) patch.variableAmount = data.variableAmount;
    if (data.active !== undefined) patch.active = data.active;
    if (data.description !== undefined) patch.description = data.description ?? null;
    if (data.notes !== undefined) patch.notes = data.notes ?? null;

    const row = await this.prisma.scoped.recurringExpense.update({ where: { id }, data: patch });
    await this.audit('RECURRING_EXPENSE_UPDATED', id, this.snap(existing), this.snap(row));
    return this.map(row);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.scoped.recurringExpense.findFirst({ where: { id } });
    if (!existing) throw new ResourceNotFoundException('Gasto fixo');
    // As despesas já geradas permanecem (FK onDelete SetNull) — histórico intacto.
    await this.prisma.scoped.recurringExpense.delete({ where: { id } });
    await this.audit('RECURRING_EXPENSE_DELETED', id, this.snap(existing), null);
  }

  /** Gera (ou recupera) a despesa do mês corrente para este gasto fixo, sob demanda. */
  async generateNow(id: string): Promise<GenerateRecurringExpenseResponse> {
    const rec = await this.prisma.scoped.recurringExpense.findFirst({ where: { id } });
    if (!rec) throw new ResourceNotFoundException('Gasto fixo');
    const tz = await this.unitTimezone(rec.unitId);
    const { period } = this.localParts(new Date(), tz);
    return this.materialize(rec, period, tz);
  }

  // ---------- Job diário ----------

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async handleCron(): Promise<void> {
    const recs = await this.prisma.recurringExpense.findMany({
      where: { active: true },
      include: { unit: { select: { timezone: true } } },
    });
    let created = 0;
    for (const rec of recs) {
      const tz = rec.unit.timezone ?? 'America/Sao_Paulo';
      const { period, day } = this.localParts(new Date(), tz);
      // Já passou (ou chegou) o dia do mês e ainda não gerou esta competência →
      // materializa. O `>=` cobre execuções atrasadas (ex: servidor fora no dia).
      if (day >= rec.dayOfMonth && rec.lastGeneratedPeriod !== period) {
        try {
          const res = await this.materialize(rec, period, tz);
          if (res.created) created += 1;
        } catch (err) {
          this.logger.warn(
            { recurringExpenseId: rec.id, err: err instanceof Error ? err.message : String(err) },
            'Falha ao materializar gasto fixo (segue para os próximos).',
          );
        }
      }
    }
    if (created > 0) {
      this.logger.log({ created }, 'Gastos fixos materializados em despesas.');
    }
  }

  // ---------- núcleo de materialização ----------

  private async materialize(
    rec: RecurringRow,
    period: string,
    tz: string,
  ): Promise<GenerateRecurringExpenseResponse> {
    const paidAt = fromZonedTime(
      `${period}-${String(rec.dayOfMonth).padStart(2, '0')}T12:00:00`,
      tz,
    );
    try {
      const expense = await this.prisma.$transaction(async (tx) => {
        const created = await tx.expense.create({
          data: {
            unitId: rec.unitId,
            category: rec.category,
            amountCents: rec.amountCents,
            paidAt,
            description: rec.description,
            notes: rec.notes,
            createdById: rec.createdById,
            recurringExpenseId: rec.id,
            period,
          } as unknown as Prisma.ExpenseUncheckedCreateInput,
        });
        await tx.recurringExpense.update({
          where: { id: rec.id },
          data: { lastGeneratedPeriod: period },
        });
        return created;
      });
      await this.audit('RECURRING_EXPENSE_GENERATED', rec.id, null, {
        period,
        expenseId: expense.id,
        amountCents: expense.amountCents,
      });
      return { created: true, period, expense: this.mapExpense(expense) };
    } catch (err) {
      // Já existe despesa para (recurringExpenseId, period) → idempotente.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.prisma.expense.findFirst({
          where: { recurringExpenseId: rec.id, period },
        });
        if (existing) {
          return { created: false, period, expense: this.mapExpense(existing) };
        }
      }
      throw err;
    }
  }

  // ---------- helpers ----------

  private actorId(): string | null {
    return this.cls.get<string>(CLS_KEYS.USER_ID) ?? null;
  }

  private async unitTimezone(unitId: string): Promise<string> {
    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      select: { timezone: true },
    });
    return unit?.timezone ?? 'America/Sao_Paulo';
  }

  /** Data local (no fuso da unidade): mês de competência (YYYY-MM) e dia (1–31). */
  private localParts(now: Date, tz: string): { period: string; day: number } {
    const local = now.toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD
    return { period: local.slice(0, 7), day: Number(local.slice(8, 10)) };
  }

  private map(row: RecurringRow): RecurringExpenseResponse {
    return {
      id: row.id,
      unitId: row.unitId,
      category: row.category,
      amountCents: row.amountCents,
      dayOfMonth: row.dayOfMonth,
      variableAmount: row.variableAmount,
      active: row.active,
      description: row.description,
      notes: row.notes,
      lastGeneratedPeriod: row.lastGeneratedPeriod,
      createdById: row.createdById,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapExpense(row: ExpenseRow): ExpenseResponse {
    return {
      id: row.id,
      unitId: row.unitId,
      category: row.category,
      amountCents: row.amountCents,
      paidAt: row.paidAt,
      description: row.description,
      notes: row.notes,
      createdById: row.createdById,
      recurringExpenseId: row.recurringExpenseId,
      period: row.period,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private snap(row: RecurringRow): Prisma.JsonObject {
    return {
      category: row.category,
      amountCents: row.amountCents,
      dayOfMonth: row.dayOfMonth,
      variableAmount: row.variableAmount,
      active: row.active,
    };
  }

  private async audit(
    action: string,
    entityId: string,
    before: Prisma.JsonObject | null,
    after: Prisma.JsonObject | null,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: this.actorId(),
        action,
        entity: 'RecurringExpense',
        entityId,
        before: before ?? Prisma.JsonNull,
        after: after ?? Prisma.JsonNull,
      },
    });
  }
}
