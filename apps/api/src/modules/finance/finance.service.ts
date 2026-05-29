import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { fromZonedTime } from 'date-fns-tz';
import type {
  CreateExpenseRequest,
  CreatePaymentRequest,
  ExpenseResponse,
  FinanceSummaryQuery,
  FinanceSummaryResponse,
  ListExpensesQuery,
  ListPaymentsQuery,
  PaymentResponse,
  UpdateExpenseRequest,
  UpdatePaymentRequest,
} from '@rpx/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CLS_KEYS } from '../../common/cls/cls-keys';
import { ResourceNotFoundException } from '../../common/exceptions/app.exception';

const paymentInclude = {
  patient: { select: { fullName: true } },
  plan: { select: { service: { select: { name: true } } } },
} satisfies Prisma.PaymentInclude;
type PaymentWithRelations = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  // ---------- Pagamentos ----------

  async createPayment(data: CreatePaymentRequest): Promise<PaymentResponse> {
    let patientId = data.patientId ?? null;

    if (data.planId) {
      const plan = await this.prisma.scoped.plan.findFirst({
        where: { id: data.planId },
        select: { patientId: true },
      });
      if (!plan) throw new ResourceNotFoundException('Plano');
      patientId = patientId ?? plan.patientId;
    } else if (patientId) {
      const patient = await this.prisma.scoped.patient.findFirst({
        where: { id: patientId },
        select: { id: true },
      });
      if (!patient) throw new ResourceNotFoundException('Paciente');
    }

    const paidAt = data.status === 'PAID' ? (data.paidAt ?? new Date()) : (data.paidAt ?? null);

    const row = await this.prisma.scoped.payment.create({
      data: {
        planId: data.planId ?? null,
        patientId,
        amountCents: data.amountCents,
        method: data.method,
        status: data.status,
        paidAt,
        dueAt: data.dueAt ?? null,
        description: data.description ?? null,
        notes: data.notes ?? null,
        createdById: this.actorId(),
      } as unknown as Prisma.PaymentUncheckedCreateInput,
      include: paymentInclude,
    });
    await this.audit('PAYMENT_CREATED', 'Payment', row.id, null, this.paymentSnap(row));
    return this.mapPayment(row);
  }

  async listPayments(filters: ListPaymentsQuery): Promise<PaymentResponse[]> {
    const where: Prisma.PaymentWhereInput = {};
    if (filters.status) where.status = filters.status;
    if (filters.method) where.method = filters.method;
    if (filters.patientId) where.patientId = filters.patientId;
    if (filters.planId) where.planId = filters.planId;
    if (filters.from || filters.to) {
      where.paidAt = {};
      if (filters.from) where.paidAt.gte = filters.from;
      if (filters.to) where.paidAt.lte = filters.to;
    }
    const rows = await this.prisma.scoped.payment.findMany({
      where,
      include: paymentInclude,
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => this.mapPayment(r));
  }

  async listPaymentsForPatient(patientId: string): Promise<PaymentResponse[]> {
    const rows = await this.prisma.scoped.payment.findMany({
      where: { patientId },
      include: paymentInclude,
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => this.mapPayment(r));
  }

  async getPayment(id: string): Promise<PaymentResponse> {
    const row = await this.prisma.scoped.payment.findFirst({
      where: { id },
      include: paymentInclude,
    });
    if (!row) throw new ResourceNotFoundException('Pagamento');
    return this.mapPayment(row);
  }

  async updatePayment(id: string, data: UpdatePaymentRequest): Promise<PaymentResponse> {
    const existing = await this.prisma.scoped.payment.findFirst({ where: { id } });
    if (!existing) throw new ResourceNotFoundException('Pagamento');

    const patch: Prisma.PaymentUncheckedUpdateInput = {};
    if (data.amountCents !== undefined) patch.amountCents = data.amountCents;
    if (data.method !== undefined) patch.method = data.method;
    if (data.status !== undefined) patch.status = data.status;
    if (data.paidAt !== undefined) patch.paidAt = data.paidAt;
    if (data.dueAt !== undefined) patch.dueAt = data.dueAt;
    if (data.description !== undefined) patch.description = data.description;
    if (data.notes !== undefined) patch.notes = data.notes;

    // Ao marcar como PAID sem paidAt explícito, registra o recebimento agora.
    if (data.status === 'PAID' && data.paidAt === undefined && existing.paidAt === null) {
      patch.paidAt = new Date();
    }

    const row = await this.prisma.scoped.payment.update({
      where: { id },
      data: patch,
      include: paymentInclude,
    });
    await this.audit(
      'PAYMENT_UPDATED',
      'Payment',
      id,
      this.paymentSnap(existing),
      this.paymentSnap(row),
    );
    return this.mapPayment(row);
  }

  async deletePayment(id: string): Promise<void> {
    const existing = await this.prisma.scoped.payment.findFirst({ where: { id } });
    if (!existing) throw new ResourceNotFoundException('Pagamento');
    await this.prisma.scoped.payment.delete({ where: { id } });
    await this.audit('PAYMENT_DELETED', 'Payment', id, this.paymentSnap(existing), null);
  }

  // ---------- Despesas ----------

  async createExpense(data: CreateExpenseRequest): Promise<ExpenseResponse> {
    const row = await this.prisma.scoped.expense.create({
      data: {
        category: data.category,
        amountCents: data.amountCents,
        paidAt: data.paidAt,
        description: data.description ?? null,
        notes: data.notes ?? null,
        createdById: this.actorId(),
      } as unknown as Prisma.ExpenseUncheckedCreateInput,
    });
    await this.audit('EXPENSE_CREATED', 'Expense', row.id, null, this.expenseSnap(row));
    return this.mapExpense(row);
  }

  async listExpenses(filters: ListExpensesQuery): Promise<ExpenseResponse[]> {
    const where: Prisma.ExpenseWhereInput = {};
    if (filters.category) where.category = filters.category;
    if (filters.from || filters.to) {
      where.paidAt = {};
      if (filters.from) where.paidAt.gte = filters.from;
      if (filters.to) where.paidAt.lte = filters.to;
    }
    const rows = await this.prisma.scoped.expense.findMany({
      where,
      orderBy: [{ paidAt: 'desc' }],
    });
    return rows.map((r) => this.mapExpense(r));
  }

  async updateExpense(id: string, data: UpdateExpenseRequest): Promise<ExpenseResponse> {
    const existing = await this.prisma.scoped.expense.findFirst({ where: { id } });
    if (!existing) throw new ResourceNotFoundException('Despesa');

    const patch: Prisma.ExpenseUncheckedUpdateInput = {};
    if (data.category !== undefined) patch.category = data.category;
    if (data.amountCents !== undefined) patch.amountCents = data.amountCents;
    if (data.paidAt !== undefined) patch.paidAt = data.paidAt;
    if (data.description !== undefined) patch.description = data.description;
    if (data.notes !== undefined) patch.notes = data.notes;

    const row = await this.prisma.scoped.expense.update({ where: { id }, data: patch });
    await this.audit(
      'EXPENSE_UPDATED',
      'Expense',
      id,
      this.expenseSnap(existing),
      this.expenseSnap(row),
    );
    return this.mapExpense(row);
  }

  async deleteExpense(id: string): Promise<void> {
    const existing = await this.prisma.scoped.expense.findFirst({ where: { id } });
    if (!existing) throw new ResourceNotFoundException('Despesa');
    await this.prisma.scoped.expense.delete({ where: { id } });
    await this.audit('EXPENSE_DELETED', 'Expense', id, this.expenseSnap(existing), null);
  }

  // ---------- Resumo ----------

  async summary(query: FinanceSummaryQuery): Promise<FinanceSummaryResponse> {
    const unitId = this.cls.get<string>(CLS_KEYS.UNIT_ID);
    if (!unitId) throw new Error('Unit context missing.');

    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      select: { timezone: true },
    });
    const tz = unit?.timezone ?? 'America/Sao_Paulo';

    const now = new Date();
    const todayLocal = now.toLocaleDateString('en-CA', { timeZone: tz });
    const monthStart = fromZonedTime(`${todayLocal.slice(0, 7)}-01T00:00:00`, tz);

    const from = query.from ? this.startOfDay(query.from, tz) : monthStart;
    const toExclusive = query.to ? this.startOfNextDay(query.to, tz) : now;

    const paidWindow: Prisma.PaymentWhereInput = {
      unitId,
      status: 'PAID',
      paidAt: { gte: from, lt: toExclusive },
    };

    const [receivedAgg, pendingAgg, overdueAgg, expensesAgg, byMethodRows, byCategoryRows] =
      await Promise.all([
        this.prisma.payment.aggregate({
          where: paidWindow,
          _sum: { amountCents: true },
          _count: true,
        }),
        this.prisma.payment.aggregate({
          where: { unitId, status: 'PENDING' },
          _sum: { amountCents: true },
        }),
        this.prisma.payment.aggregate({
          where: { unitId, status: 'PENDING', dueAt: { lt: now } },
          _sum: { amountCents: true },
        }),
        this.prisma.expense.aggregate({
          where: { unitId, paidAt: { gte: from, lt: toExclusive } },
          _sum: { amountCents: true },
          _count: true,
        }),
        this.prisma.payment.groupBy({
          by: ['method'],
          where: paidWindow,
          _sum: { amountCents: true },
          _count: true,
        }),
        this.prisma.expense.groupBy({
          by: ['category'],
          where: { unitId, paidAt: { gte: from, lt: toExclusive } },
          _sum: { amountCents: true },
          _count: true,
        }),
      ]);

    const receivedCents = receivedAgg._sum.amountCents ?? 0;
    const expensesCents = expensesAgg._sum.amountCents ?? 0;

    return {
      from: from.toISOString(),
      to: toExclusive.toISOString(),
      receivedCents,
      pendingCents: pendingAgg._sum.amountCents ?? 0,
      overdueCents: overdueAgg._sum.amountCents ?? 0,
      expensesCents,
      balanceCents: receivedCents - expensesCents,
      byMethod: byMethodRows
        .map((r) => ({
          method: r.method,
          totalCents: r._sum.amountCents ?? 0,
          count: r._count,
        }))
        .sort((a, b) => b.totalCents - a.totalCents),
      byExpenseCategory: byCategoryRows
        .map((r) => ({
          category: r.category,
          totalCents: r._sum.amountCents ?? 0,
          count: r._count,
        }))
        .sort((a, b) => b.totalCents - a.totalCents),
      paymentsCount: receivedAgg._count,
      expensesCount: expensesAgg._count,
    };
  }

  // ---------- helpers ----------

  private actorId(): string | null {
    return this.cls.get<string>(CLS_KEYS.USER_ID) ?? null;
  }

  private startOfDay(d: Date, tz: string): Date {
    return fromZonedTime(`${d.toLocaleDateString('en-CA', { timeZone: tz })}T00:00:00`, tz);
  }

  private startOfNextDay(d: Date, tz: string): Date {
    return new Date(this.startOfDay(d, tz).getTime() + 86_400_000);
  }

  private mapPayment(row: PaymentWithRelations): PaymentResponse {
    return {
      id: row.id,
      unitId: row.unitId,
      planId: row.planId,
      patientId: row.patientId,
      amountCents: row.amountCents,
      method: row.method,
      status: row.status,
      paidAt: row.paidAt,
      dueAt: row.dueAt,
      description: row.description,
      notes: row.notes,
      pagarmeChargeId: row.pagarmeChargeId,
      createdById: row.createdById,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      patientName: row.patient?.fullName ?? null,
      serviceName: row.plan?.service.name ?? null,
    };
  }

  private mapExpense(row: {
    id: string;
    unitId: string;
    category: ExpenseResponse['category'];
    amountCents: number;
    paidAt: Date;
    description: string | null;
    notes: string | null;
    createdById: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): ExpenseResponse {
    return {
      id: row.id,
      unitId: row.unitId,
      category: row.category,
      amountCents: row.amountCents,
      paidAt: row.paidAt,
      description: row.description,
      notes: row.notes,
      createdById: row.createdById,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private paymentSnap(row: {
    amountCents: number;
    method: string;
    status: string;
    paidAt: Date | null;
    dueAt: Date | null;
    planId: string | null;
    patientId: string | null;
  }): Prisma.JsonObject {
    return {
      amountCents: row.amountCents,
      method: row.method,
      status: row.status,
      paidAt: row.paidAt ? row.paidAt.toISOString() : null,
      dueAt: row.dueAt ? row.dueAt.toISOString() : null,
      planId: row.planId,
      patientId: row.patientId,
    };
  }

  private expenseSnap(row: {
    category: string;
    amountCents: number;
    paidAt: Date;
  }): Prisma.JsonObject {
    return {
      category: row.category,
      amountCents: row.amountCents,
      paidAt: row.paidAt.toISOString(),
    };
  }

  private async audit(
    action: string,
    entity: string,
    entityId: string,
    before: Prisma.JsonObject | null,
    after: Prisma.JsonObject | null,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: this.actorId(),
        action,
        entity,
        entityId,
        before: before ?? Prisma.JsonNull,
        after: after ?? Prisma.JsonNull,
      },
    });
  }
}
