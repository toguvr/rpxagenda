import { Injectable } from '@nestjs/common';
import { Prisma, type Plan as PlanRow } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import type {
  CreatePlanRequest,
  ListPlansQuery,
  PlanResponse,
  UpdatePlanStatusRequest,
} from '@rpx/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CLS_KEYS } from '../../common/cls/cls-keys';
import {
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/exceptions/app.exception';
import { startOfWeekMonday } from '../schedules/slot-generator';
import {
  buildQuotaStatus,
  deriveExpectedStatus,
  isPlanUsable,
  type PlanLike,
} from './plan-helpers';

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  // ---------- CRUD ----------

  async create(data: CreatePlanRequest): Promise<PlanResponse> {
    const service = await this.prisma.scoped.service.findFirst({
      where: { id: data.serviceId },
    });
    if (!service) throw new ResourceNotFoundException('Serviço');
    if (service.acceptedPlanType !== data.type) {
      throw new ResourceConflictException(
        `Serviço "${service.name}" aceita ${service.acceptedPlanType}, não ${data.type}.`,
      );
    }
    const patient = await this.prisma.scoped.patient.findFirst({
      where: { id: data.patientId },
    });
    if (!patient) throw new ResourceNotFoundException('Paciente');

    const base = {
      patientId: data.patientId,
      serviceId: data.serviceId,
      type: data.type,
      startsAt: data.startsAt ?? new Date(),
    };

    // unitId é injetado pela extensão de unit-scope a partir do CLS.
    const createInput =
      data.type === 'PACKAGE'
        ? {
            ...base,
            totalSessions: data.totalSessions,
            remainingSessions: data.totalSessions,
            validUntil: data.validUntil,
          }
        : { ...base, weeklyQuota: data.weeklyQuota };

    const row = await this.prisma.scoped.plan.create({
      data: createInput as unknown as Prisma.PlanUncheckedCreateInput,
    });
    return this.toResponse(row);
  }

  async list(filters: ListPlansQuery): Promise<PlanResponse[]> {
    const where: Prisma.PlanWhereInput = {};
    if (filters.status) where.status = filters.status;
    if (filters.type) where.type = filters.type;
    if (filters.serviceId) where.serviceId = filters.serviceId;
    if (filters.patientId) where.patientId = filters.patientId;
    const rows = await this.prisma.scoped.plan.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
    });
    return Promise.all(rows.map((r) => this.toResponseWithUsage(r)));
  }

  async listForPatient(patientId: string): Promise<PlanResponse[]> {
    const rows = await this.prisma.scoped.plan.findMany({
      where: { patientId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    return Promise.all(rows.map((r) => this.toResponseWithUsage(r)));
  }

  /** Endpoint do app do paciente: lista os planos do user autenticado. */
  async listForCurrentPatientUser(): Promise<PlanResponse[]> {
    const userId = this.cls.get<string>(CLS_KEYS.USER_ID);
    if (!userId) throw new Error('User context missing.');
    const patient = await this.prisma.patient.findUnique({ where: { userId } });
    if (!patient) {
      // user autenticado mas não vinculado a um Patient (ex: admin tentando) — devolve vazio.
      return [];
    }
    return this.listForPatient(patient.id);
  }

  async findById(id: string): Promise<PlanResponse> {
    const row = await this.prisma.scoped.plan.findFirst({ where: { id } });
    if (!row) throw new ResourceNotFoundException('Plano');
    return this.toResponseWithUsage(row);
  }

  async updateStatus(id: string, body: UpdatePlanStatusRequest): Promise<PlanResponse> {
    const existing = await this.prisma.scoped.plan.findFirst({ where: { id } });
    if (!existing) throw new ResourceNotFoundException('Plano');

    // Bloqueios simples de transição: status final não volta para ACTIVE.
    if (
      (existing.status === 'CANCELLED' || existing.status === 'EXPIRED') &&
      body.status === 'ACTIVE'
    ) {
      throw new ResourceConflictException(
        'Plano em estado final (CANCELLED/EXPIRED) não pode ser reativado. Crie um novo plano.',
      );
    }

    const row = await this.prisma.scoped.plan.update({
      where: { id },
      data: {
        status: body.status,
        ...(body.status === 'CANCELLED' || body.status === 'EXPIRED' ? { endsAt: new Date() } : {}),
      },
    });
    // Registra mudança de status no AuditLog (operação sensível por CLAUDE.md §2.3).
    const actorId = this.cls.get<string>(CLS_KEYS.USER_ID) ?? null;
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'PLAN_STATUS_CHANGED',
        entity: 'Plan',
        entityId: id,
        before: { status: existing.status },
        after: { status: row.status, reason: body.reason ?? null },
      },
    });
    return this.toResponse(row);
  }

  // ---------- helpers públicos para outros módulos (Fase 3) ----------

  /** Verifica se o plano está utilizável agora (status, datas, saldo). */
  async assertUsable(planId: string, now: Date = new Date()): Promise<PlanRow> {
    const plan = await this.prisma.scoped.plan.findFirst({ where: { id: planId } });
    if (!plan) throw new ResourceNotFoundException('Plano');
    if (!isPlanUsable(plan, now)) {
      throw new ResourceConflictException(
        `Plano em estado ${plan.status} não pode ser usado para agendar.`,
      );
    }
    return plan;
  }

  /**
   * Conta agendamentos do plano que consomem quota na semana corrente
   * (segunda 00:00 no fuso da unidade).
   */
  async countWeeklyUsageForPlan(
    planId: string,
    timezone: string,
    now: Date = new Date(),
  ): Promise<number> {
    const weekStart = startOfWeekMonday(now, timezone);
    return this.prisma.scoped.appointment.count({
      where: {
        planId,
        consumedSession: true,
        status: { in: ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'NO_SHOW'] },
        startsAt: { gte: weekStart },
      },
    });
  }

  // ---------- formatadores ----------

  private toResponse(row: PlanRow): PlanResponse {
    return {
      id: row.id,
      unitId: row.unitId,
      patientId: row.patientId,
      serviceId: row.serviceId,
      type: row.type,
      status: row.status,
      totalSessions: row.totalSessions,
      remainingSessions: row.remainingSessions,
      validUntil: row.validUntil,
      weeklyQuota: row.weeklyQuota,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async toResponseWithUsage(row: PlanRow): Promise<PlanResponse> {
    const base = this.toResponse(row);
    if (row.type !== 'SUBSCRIPTION') return base;
    const unitTimezone = await this.unitTimezone();
    const usage = await this.countWeeklyUsageForPlan(row.id, unitTimezone);
    const quota = buildQuotaStatus(row as PlanLike, usage);
    return { ...base, weeklyUsage: quota.weeklyUsage };
  }

  private async unitTimezone(): Promise<string> {
    const unitId = this.cls.get<string>(CLS_KEYS.UNIT_ID);
    if (!unitId) return 'America/Sao_Paulo';
    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      select: { timezone: true },
    });
    return unit?.timezone ?? 'America/Sao_Paulo';
  }
}

// silence ts-unused for the helper used only by Fase 3 callers
void deriveExpectedStatus;
