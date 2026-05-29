import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  type Appointment as AppointmentRow,
  type AppointmentEquipment,
  type AppointmentStatus as AppointmentStatusDb,
} from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { fromZonedTime } from 'date-fns-tz';
import type {
  AppointmentResponse,
  CreateAppointmentRequest,
  CreateRecurringAppointmentsRequest,
  ListAppointmentsQuery,
  RecurringAppointmentsResponse,
} from '@rpx/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CLS_KEYS } from '../../common/cls/cls-keys';
import {
  AppointmentValidationException,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/exceptions/app.exception';
import { startOfWeekMonday } from '../schedules/slot-generator';
import {
  ACTIVE_STATUSES_FOR_CAPACITY,
  STATUSES_THAT_CONSUME_QUOTA,
  validateAppointment,
  validateReschedule,
  type CapacitySnapshot,
} from './capacity-validators';

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  // -------- Create --------

  async create(
    data: CreateAppointmentRequest,
    now: Date = new Date(),
  ): Promise<AppointmentResponse> {
    const unitId = this.cls.get<string>(CLS_KEYS.UNIT_ID);
    if (!unitId) throw new Error('Unit context missing.');

    // Carrega dados pré-validação fora da transação serializável (read-only, barato).
    const [service, plan, equipments] = await Promise.all([
      this.prisma.scoped.service.findFirst({ where: { id: data.serviceId } }),
      data.planId
        ? this.prisma.scoped.plan.findFirst({ where: { id: data.planId } })
        : Promise.resolve(null),
      data.equipmentIds.length > 0
        ? this.prisma.scoped.equipment.findMany({
            where: { id: { in: data.equipmentIds } },
            select: { id: true, totalQuantity: true },
          })
        : Promise.resolve([] as Array<{ id: string; totalQuantity: number }>),
    ]);

    if (!service) throw new ResourceNotFoundException('Serviço');
    if (data.planId && !plan) throw new ResourceNotFoundException('Plano');
    // Agendamento avulso (sem plano) só é permitido para Avaliação.
    if (!plan && service.type !== 'AVALIACAO') {
      throw new ResourceConflictException(
        'Agendamento sem plano só é permitido para Avaliação — selecione um plano.',
      );
    }

    if (data.equipmentIds.length > 0 && equipments.length !== new Set(data.equipmentIds).size) {
      throw new ResourceConflictException(
        'Um ou mais equipmentIds informados não existem nesta unidade.',
      );
    }

    const endsAt = new Date(data.startsAt.getTime() + service.durationMinutes * 60 * 1000);
    const unitTimezone = await this.unitTimezone();

    // Transação SERIALIZABLE + retry em serialization failure.
    // Sob SERIALIZABLE, N requests concorrentes lendo o mesmo snapshot vazio
    // tentam inserir; apenas 1 commita por rodada e os outros recebem P2034.
    // Para honrar slotCapacity > 1, fazemos retry com jitter; transações que
    // tentam estourar a capacidade vão re-validar com snapshot atualizado
    // (vendo as inserções já commitadas) e falhar com SLOT_FULL na N-ésima.
    const MAX_ATTEMPTS = 5;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const created = await this.prisma.$transaction(
          async (tx) => {
            const snapshot = await this.collectSnapshot(tx, {
              unitId,
              patientId: data.patientId,
              serviceId: data.serviceId,
              planId: data.planId,
              planType: plan?.type,
              startsAt: data.startsAt,
              endsAt,
              equipmentIds: data.equipmentIds,
              unitTimezone,
              now,
            });

            const failure = validateAppointment({
              now,
              startsAt: data.startsAt,
              endsAt,
              patientId: data.patientId,
              service: {
                id: service.id,
                active: service.active,
                durationMinutes: service.durationMinutes,
                slotCapacity: service.slotCapacity,
                schedulingLeadMinutes: service.schedulingLeadMinutes,
                acceptedPlanType: service.acceptedPlanType,
              },
              plan: plan
                ? {
                    id: plan.id,
                    patientId: plan.patientId,
                    serviceId: plan.serviceId,
                    type: plan.type,
                    status: plan.status,
                    remainingSessions: plan.remainingSessions,
                    validUntil: plan.validUntil,
                    weeklyQuota: plan.weeklyQuota,
                    startsAt: plan.startsAt,
                    endsAt: plan.endsAt,
                  }
                : null,
              equipmentIds: data.equipmentIds,
              equipments,
              snapshot,
            });

            if (failure) {
              throw new AppointmentValidationException(failure.code, failure.message, failure);
            }

            const appointment = await tx.appointment.create({
              data: {
                unitId,
                patientId: data.patientId,
                serviceId: data.serviceId,
                planId: data.planId ?? null,
                startsAt: data.startsAt,
                endsAt,
                status: 'SCHEDULED',
                // Avulso (sem plano) não consome sessão.
                consumedSession: !!plan,
                equipments: {
                  create: data.equipmentIds.map((equipmentId) => ({ equipmentId })),
                },
              },
              include: { equipments: true },
            });

            // Decrementa saldo do PACKAGE atomicamente.
            if (plan?.type === 'PACKAGE') {
              await tx.plan.update({
                where: { id: plan.id },
                data: { remainingSessions: { decrement: 1 } },
              });
            }

            return appointment;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );

        return this.toResponse(created);
      } catch (err) {
        const isSerializationFailure =
          err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034';
        if (isSerializationFailure && attempt < MAX_ATTEMPTS) {
          // backoff curto com jitter (10-50ms) antes de retry
          await new Promise((r) => setTimeout(r, 10 + Math.floor(Math.random() * 40)));
          continue;
        }
        if (isSerializationFailure) {
          throw new ResourceConflictException(
            'Conflito de concorrência persistente ao agendar — tente novamente em alguns segundos.',
          );
        }
        throw err;
      }
    }
    // unreachable, mas TS quer um return:
    throw new ResourceConflictException('Conflito de concorrência inesperado ao agendar.');
  }

  // -------- Recorrente (dias fixos) --------

  /**
   * Agenda os dias fixos de um paciente em um plano.
   * - PACKAGE: gera ocorrências até esgotar as sessões restantes (limitado pela validade).
   * - SUBSCRIPTION: gera até `endDate` (ou o fim do plano).
   * Cada ocorrência passa pela validação do §4.3 (via `create`). Conflitos são
   * pulados e reportados em `skipped`. Equipamentos vêm do protocolo ativo do plano.
   */
  async createRecurring(
    data: CreateRecurringAppointmentsRequest,
    now: Date = new Date(),
  ): Promise<RecurringAppointmentsResponse> {
    const unitId = this.cls.get<string>(CLS_KEYS.UNIT_ID);
    if (!unitId) throw new Error('Unit context missing.');

    const plan = await this.prisma.scoped.plan.findFirst({ where: { id: data.planId } });
    if (!plan) throw new ResourceNotFoundException('Plano');
    if (plan.patientId !== data.patientId) {
      throw new ResourceConflictException('Plano informado não pertence ao paciente.');
    }

    const tz = await this.unitTimezone();

    // Equipamentos sugeridos do protocolo ativo do plano (pré-marcados em todos).
    const protocol = await this.prisma.scoped.protocol.findFirst({
      where: { planId: data.planId, active: true },
      include: { equipments: { select: { equipmentId: true } } },
    });
    const equipmentIds = protocol?.equipments.map((e) => e.equipmentId) ?? [];

    // Horizonte de geração por tipo de plano.
    let endYmd: string | null;
    let maxCount = Number.POSITIVE_INFINITY;
    if (plan.type === 'PACKAGE') {
      if (plan.remainingSessions == null || plan.remainingSessions <= 0) {
        throw new ResourceConflictException('Pacote sem sessões restantes para agendar.');
      }
      maxCount = plan.remainingSessions;
      endYmd = plan.validUntil ? this.ymdInTz(plan.validUntil, tz) : null;
    } else {
      const end = data.endDate ?? (plan.endsAt ? this.ymdInTz(plan.endsAt, tz) : null);
      if (!end) {
        throw new ResourceConflictException(
          'Informe a data fim — a assinatura não tem fim definido.',
        );
      }
      endYmd = end;
    }

    const candidates = this.generateOccurrences({
      startYmd: data.startDate,
      endYmd,
      slots: data.slots,
      tz,
      now,
      maxCount,
    });

    const created: AppointmentResponse[] = [];
    const skipped: { startsAt: Date; reason: string }[] = [];

    for (const startsAt of candidates) {
      try {
        created.push(
          await this.create(
            {
              patientId: data.patientId,
              serviceId: plan.serviceId,
              planId: data.planId,
              startsAt,
              equipmentIds,
            },
            now,
          ),
        );
      } catch (err) {
        if (
          err instanceof AppointmentValidationException ||
          err instanceof ResourceConflictException
        ) {
          skipped.push({ startsAt, reason: err.message });
          // PACKAGE sem saldo: não adianta tentar as próximas ocorrências.
          if (err instanceof AppointmentValidationException && err.code === 'PLAN_NOT_USABLE') {
            break;
          }
        } else {
          throw err;
        }
      }
    }

    return { created, skipped };
  }

  /** Gera os instantes (UTC) das ocorrências dos dias fixos, em ordem cronológica. */
  private generateOccurrences(args: {
    startYmd: string;
    endYmd: string | null;
    slots: { weekday: number; time: string }[];
    tz: string;
    now: Date;
    maxCount: number;
  }): Date[] {
    const MAX_DAYS = 400;
    const out: Date[] = [];
    let cursor = args.startYmd;
    for (let i = 0; i < MAX_DAYS; i++) {
      if (args.endYmd && cursor > args.endYmd) break;
      const weekday = new Date(`${cursor}T12:00:00Z`).getUTCDay();
      const daySlots = args.slots
        .filter((s) => s.weekday === weekday)
        .sort((a, b) => a.time.localeCompare(b.time));
      for (const s of daySlots) {
        const startsAt = fromZonedTime(`${cursor}T${s.time}:00`, args.tz);
        if (startsAt.getTime() <= args.now.getTime()) continue; // descarta passado
        out.push(startsAt);
        if (out.length >= args.maxCount) return out;
      }
      cursor = this.addDaysYmd(cursor, 1);
    }
    return out;
  }

  private ymdInTz(date: Date, tz: string): string {
    return date.toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD
  }

  private addDaysYmd(ymd: string, n: number): string {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + n);
    return dt.toISOString().slice(0, 10);
  }

  // -------- Reschedule (drag-and-drop) --------

  /**
   * Remarca um agendamento para um novo horário. Só agendamentos ainda não
   * realizados (SCHEDULED, CONFIRMED) podem ser movidos. Revalida a capacidade
   * do §4.3 para o novo horário, excluindo o próprio agendamento da contagem.
   * Não reconsome o plano — apenas move o horário (recalcula endsAt pela duração
   * do serviço). Com `force=true` o admin ignora a violação de capacidade, e a
   * ação é auditada como remarcação forçada.
   */
  async reschedule(
    id: string,
    newStartsAt: Date,
    force = false,
    now: Date = new Date(),
  ): Promise<AppointmentResponse> {
    const unitId = this.cls.get<string>(CLS_KEYS.UNIT_ID);
    if (!unitId) throw new Error('Unit context missing.');
    const userId = this.cls.get<string>(CLS_KEYS.USER_ID) ?? null;

    const appt = await this.prisma.scoped.appointment.findFirst({
      where: { id },
      include: {
        service: true,
        plan: { select: { id: true, type: true } },
        equipments: { select: { equipmentId: true } },
      },
    });
    if (!appt) throw new ResourceNotFoundException('Agendamento');

    if (appt.status !== 'SCHEDULED' && appt.status !== 'CONFIRMED') {
      throw new ResourceConflictException(
        `Só é possível remarcar agendamentos em SCHEDULED ou CONFIRMED (atual: ${appt.status}).`,
      );
    }

    const endsAt = new Date(newStartsAt.getTime() + appt.service.durationMinutes * 60 * 1000);
    const equipmentIds = appt.equipments.map((e) => e.equipmentId);

    // No-op: mesmo horário.
    if (appt.startsAt.getTime() === newStartsAt.getTime()) {
      return this.findById(id);
    }

    const equipments =
      equipmentIds.length > 0
        ? await this.prisma.scoped.equipment.findMany({
            where: { id: { in: equipmentIds } },
            select: { id: true, totalQuantity: true },
          })
        : [];
    const unitTimezone = await this.unitTimezone();

    const MAX_ATTEMPTS = 5;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const updated = await this.prisma.$transaction(
          async (tx) => {
            if (!force) {
              const snapshot = await this.collectSnapshot(tx, {
                unitId,
                patientId: appt.patientId,
                serviceId: appt.serviceId,
                planId: appt.planId ?? undefined,
                planType: appt.plan?.type,
                startsAt: newStartsAt,
                endsAt,
                equipmentIds,
                unitTimezone,
                now,
                excludeAppointmentId: id,
              });

              const failure = validateReschedule({
                now,
                startsAt: newStartsAt,
                endsAt,
                service: {
                  id: appt.service.id,
                  active: appt.service.active,
                  durationMinutes: appt.service.durationMinutes,
                  slotCapacity: appt.service.slotCapacity,
                  schedulingLeadMinutes: appt.service.schedulingLeadMinutes,
                  acceptedPlanType: appt.service.acceptedPlanType,
                },
                equipmentIds,
                equipments,
                snapshot,
              });

              if (failure) {
                throw new AppointmentValidationException(failure.code, failure.message, failure);
              }
            }

            const next = await tx.appointment.update({
              where: { id },
              data: { startsAt: newStartsAt, endsAt },
              include: { equipments: true },
            });

            await tx.auditLog.create({
              data: {
                actorId: userId,
                action: force ? 'APPOINTMENT_RESCHEDULED_FORCED' : 'APPOINTMENT_RESCHEDULED',
                entity: 'Appointment',
                entityId: id,
                before: {
                  startsAt: appt.startsAt.toISOString(),
                  endsAt: appt.endsAt.toISOString(),
                },
                after: { startsAt: newStartsAt.toISOString(), endsAt: endsAt.toISOString(), force },
              },
            });

            return next;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );

        return this.toResponse(updated);
      } catch (err) {
        const isSerializationFailure =
          err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034';
        if (isSerializationFailure && attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 10 + Math.floor(Math.random() * 40)));
          continue;
        }
        if (isSerializationFailure) {
          throw new ResourceConflictException(
            'Conflito de concorrência persistente ao remarcar — tente novamente em alguns segundos.',
          );
        }
        throw err;
      }
    }
    throw new ResourceConflictException('Conflito de concorrência inesperado ao remarcar.');
  }

  // -------- List / Get --------

  async list(filters: ListAppointmentsQuery): Promise<AppointmentResponse[]> {
    const where: Prisma.AppointmentWhereInput = {};
    if (filters.patientId) where.patientId = filters.patientId;
    if (filters.serviceId) where.serviceId = filters.serviceId;
    if (filters.status) where.status = filters.status;
    if (filters.fromDate || filters.toDate) {
      where.startsAt = {};
      if (filters.fromDate) where.startsAt.gte = filters.fromDate;
      if (filters.toDate) where.startsAt.lte = filters.toDate;
    }
    const rows = await this.prisma.scoped.appointment.findMany({
      where,
      orderBy: { startsAt: 'asc' },
      include: { equipments: true },
    });
    return rows.map((r) => this.toResponse(r));
  }

  async listMyAppointments(): Promise<AppointmentResponse[]> {
    const userId = this.cls.get<string>(CLS_KEYS.USER_ID);
    if (!userId) return [];
    const patient = await this.prisma.patient.findUnique({ where: { userId } });
    if (!patient) return [];
    return this.list({ patientId: patient.id });
  }

  async findById(id: string): Promise<AppointmentResponse> {
    const row = await this.prisma.scoped.appointment.findFirst({
      where: { id },
      include: { equipments: true },
    });
    if (!row) throw new ResourceNotFoundException('Agendamento');
    return this.toResponse(row);
  }

  // -------- Cancel --------

  async cancel(
    id: string,
    reason: string | undefined,
    now: Date = new Date(),
  ): Promise<AppointmentResponse> {
    const userId = this.cls.get<string>(CLS_KEYS.USER_ID) ?? null;

    const result = await this.prisma.$transaction(async (tx) => {
      const appt = await tx.appointment.findFirst({
        where: { id },
        include: {
          service: { select: { cancellationLeadMinutes: true } },
          plan: { select: { id: true, type: true } },
          equipments: true,
        },
      });
      if (!appt) throw new ResourceNotFoundException('Agendamento');

      // Idempotência: cancelar duas vezes é no-op (mas devolvemos o row atual).
      if (appt.status === 'CANCELLED') return appt;
      if (appt.status === 'COMPLETED' || appt.status === 'NO_SHOW') {
        throw new ResourceConflictException(
          `Agendamento em status ${appt.status} não pode ser cancelado. Use a operação de reversão (admin).`,
        );
      }

      // Janela de antecedência: dentro → devolve a sessão; fora → mantém saldo deduzido.
      const leadMs = appt.service.cancellationLeadMinutes * 60 * 1000;
      const withinWindow = appt.startsAt.getTime() - now.getTime() >= leadMs;

      const next = await tx.appointment.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          cancelledById: userId,
          cancellationReason: reason ?? null,
          // Se cancela dentro do prazo, marca como NÃO consumido — não conta para quota.
          // Fora do prazo: mantém consumedSession=true (saldo já foi deduzido na criação).
          consumedSession: withinWindow ? false : true,
        },
        include: { equipments: true },
      });

      if (appt.plan && appt.plan.type === 'PACKAGE' && withinWindow) {
        await tx.plan.update({
          where: { id: appt.plan.id },
          data: { remainingSessions: { increment: 1 } },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: withinWindow
            ? 'APPOINTMENT_CANCELLED_IN_WINDOW'
            : 'APPOINTMENT_CANCELLED_OUT_OF_WINDOW',
          entity: 'Appointment',
          entityId: id,
          before: { status: appt.status, consumedSession: appt.consumedSession },
          after: {
            status: 'CANCELLED',
            consumedSession: withinWindow ? false : true,
            reason: reason ?? null,
          },
        },
      });

      return next;
    });

    return this.toResponse(result);
  }

  // -------- Status transitions --------

  /** SCHEDULED → CONFIRMED. Paciente (próprio) ou admin. */
  confirm(id: string): Promise<AppointmentResponse> {
    return this.transition(id, {
      allowedFrom: ['SCHEDULED'],
      to: 'CONFIRMED',
      action: 'APPOINTMENT_CONFIRMED',
    });
  }

  /** SCHEDULED ou CONFIRMED → CHECKED_IN + checkedInAt. Admin/Prof (manual; iDFace na Fase 4). */
  checkIn(id: string, at: Date = new Date()): Promise<AppointmentResponse> {
    return this.transition(id, {
      allowedFrom: ['SCHEDULED', 'CONFIRMED'],
      to: 'CHECKED_IN',
      action: 'APPOINTMENT_CHECKED_IN',
      mutate: { checkedInAt: at },
    });
  }

  /** CHECKED_IN → COMPLETED + completedAt. Prof/admin. */
  complete(id: string, at: Date = new Date()): Promise<AppointmentResponse> {
    return this.transition(id, {
      allowedFrom: ['CHECKED_IN'],
      to: 'COMPLETED',
      action: 'APPOINTMENT_COMPLETED',
      mutate: { completedAt: at },
    });
  }

  /**
   * Check-in tolerante para o fluxo do iDFace: se o appointment estiver em
   * NO_SHOW (foi marcado pelo cron pouco antes do paciente chegar), reverte
   * o status, devolve o saldo se PACKAGE, e marca CHECKED_IN. Auditado com
   * action específica para distinguir do checkin normal.
   * Retorna `{ appointment, revertedNoShow }`.
   */
  async checkInAcceptingLateNoShow(
    id: string,
    at: Date = new Date(),
  ): Promise<{ response: AppointmentResponse; revertedNoShow: boolean }> {
    const userId = this.cls.get<string>(CLS_KEYS.USER_ID) ?? null;
    const result = await this.prisma.$transaction(async (tx) => {
      const appt = await tx.appointment.findFirst({
        where: { id },
        include: {
          equipments: true,
          plan: { select: { id: true, type: true } },
        },
      });
      if (!appt) throw new ResourceNotFoundException('Agendamento');

      // Idempotência: já CHECKED_IN → no-op.
      if (appt.status === 'CHECKED_IN') {
        return { row: appt, reverted: false };
      }

      let reverted = false;
      if (appt.status === 'NO_SHOW') {
        // Reverte: devolve saldo do PACKAGE se a sessão tinha sido consumida.
        if (appt.consumedSession && appt.plan && appt.plan.type === 'PACKAGE') {
          await tx.plan.update({
            where: { id: appt.plan.id },
            data: { remainingSessions: { increment: 1 } },
          });
        }
        reverted = true;
      } else if (!['SCHEDULED', 'CONFIRMED'].includes(appt.status)) {
        throw new ResourceConflictException(`Check-in não permitido a partir de ${appt.status}.`);
      }

      const next = await tx.appointment.update({
        where: { id },
        data: {
          status: 'CHECKED_IN',
          checkedInAt: at,
          // Se reverteu de NO_SHOW: já não conta mais como consumido pelo cron.
          // Como agora a sessão será efetivamente realizada (CHECKED_IN), repõe
          // consumedSession=true (paciente compareceu, sessão será consumida).
          consumedSession: true,
          ...(reverted ? { revertedAt: at, revertedById: userId } : {}),
        },
        include: { equipments: true },
      });

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: reverted ? 'APPOINTMENT_AUTO_REVERTED_BY_CHECKIN' : 'APPOINTMENT_CHECKED_IN',
          entity: 'Appointment',
          entityId: id,
          before: { status: appt.status, consumedSession: appt.consumedSession },
          after: { status: 'CHECKED_IN', consumedSession: true },
        },
      });

      return { row: next, reverted };
    });

    return { response: this.toResponse(result.row), revertedNoShow: result.reverted };
  }

  private async transition(
    id: string,
    spec: {
      allowedFrom: readonly AppointmentStatusDb[];
      to: AppointmentStatusDb;
      action: string;
      mutate?: Prisma.AppointmentUncheckedUpdateInput;
    },
  ): Promise<AppointmentResponse> {
    const userId = this.cls.get<string>(CLS_KEYS.USER_ID) ?? null;
    const result = await this.prisma.$transaction(async (tx) => {
      const appt = await tx.appointment.findFirst({
        where: { id },
        include: { equipments: true },
      });
      if (!appt) throw new ResourceNotFoundException('Agendamento');
      if (appt.status === spec.to) return appt;
      if (!spec.allowedFrom.includes(appt.status)) {
        throw new ResourceConflictException(
          `Transição de ${appt.status} para ${spec.to} não é permitida.`,
        );
      }
      const next = await tx.appointment.update({
        where: { id },
        data: { status: spec.to, ...(spec.mutate ?? {}) },
        include: { equipments: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: spec.action,
          entity: 'Appointment',
          entityId: id,
          before: { status: appt.status },
          after: { status: spec.to },
        },
      });
      return next;
    });
    return this.toResponse(result);
  }

  /**
   * Admin reverte um agendamento em status terminal (CANCELLED fora-do-prazo
   * ou NO_SHOW), devolvendo o saldo para o paciente. Marca consumedSession=false
   * e registra AuditLog.
   */
  async revertConsumption(id: string, now: Date = new Date()): Promise<AppointmentResponse> {
    const userId = this.cls.get<string>(CLS_KEYS.USER_ID) ?? null;

    const result = await this.prisma.$transaction(async (tx) => {
      const appt = await tx.appointment.findFirst({
        where: { id },
        include: { plan: { select: { id: true, type: true } } },
      });
      if (!appt) throw new ResourceNotFoundException('Agendamento');

      if (!appt.consumedSession) {
        throw new ResourceConflictException(
          'Agendamento já está sem consumo registrado — nada a reverter.',
        );
      }
      if (appt.status !== 'CANCELLED' && appt.status !== 'NO_SHOW') {
        throw new ResourceConflictException(
          `Apenas status CANCELLED ou NO_SHOW podem ter consumo revertido (atual: ${appt.status}).`,
        );
      }

      const next = await tx.appointment.update({
        where: { id },
        data: {
          consumedSession: false,
          revertedAt: now,
          revertedById: userId,
        },
        include: { equipments: true },
      });

      if (appt.plan && appt.plan.type === 'PACKAGE') {
        await tx.plan.update({
          where: { id: appt.plan.id },
          data: { remainingSessions: { increment: 1 } },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'APPOINTMENT_CONSUMPTION_REVERTED',
          entity: 'Appointment',
          entityId: id,
          before: { status: appt.status, consumedSession: true },
          after: { status: appt.status, consumedSession: false },
        },
      });

      return next;
    });

    return this.toResponse(result);
  }

  // -------- helpers --------

  /**
   * Conta agendamentos do paciente que CONSOMEM quota na semana corrente.
   * Exposto para o PlansService remover o placeholder.
   */
  async countWeeklyUsageForPlan(planId: string, now: Date = new Date()): Promise<number> {
    const plan = await this.prisma.scoped.plan.findFirst({
      where: { id: planId },
      select: { id: true, type: true, unitId: true },
    });
    if (!plan || plan.type !== 'SUBSCRIPTION') return 0;
    const tz = await this.unitTimezone();
    const weekStart = startOfWeekMonday(now, tz);
    return this.prisma.scoped.appointment.count({
      where: {
        planId,
        status: { in: [...STATUSES_THAT_CONSUME_QUOTA] },
        consumedSession: true,
        startsAt: { gte: weekStart },
      },
    });
  }

  // -------- privates --------

  private async unitTimezone(): Promise<string> {
    const unitId = this.cls.get<string>(CLS_KEYS.UNIT_ID);
    if (!unitId) return 'America/Sao_Paulo';
    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      select: { timezone: true },
    });
    return unit?.timezone ?? 'America/Sao_Paulo';
  }

  /**
   * Coleta os contadores que `validateAppointment` precisa, todos dentro da
   * mesma transação SERIALIZABLE para garantir consistência.
   */
  private async collectSnapshot(
    tx: Prisma.TransactionClient,
    args: {
      unitId: string;
      patientId: string;
      serviceId: string;
      planId?: string;
      planType?: 'PACKAGE' | 'SUBSCRIPTION';
      startsAt: Date;
      endsAt: Date;
      equipmentIds: string[];
      unitTimezone: string;
      now: Date;
      /** Em remarcações, ignora o próprio agendamento para não contar contra si. */
      excludeAppointmentId?: string;
    },
  ): Promise<CapacitySnapshot> {
    const activeStatuses = [...ACTIVE_STATUSES_FOR_CAPACITY] as AppointmentStatusDb[];
    const consumeStatuses = [...STATUSES_THAT_CONSUME_QUOTA] as AppointmentStatusDb[];
    const notSelf = args.excludeAppointmentId ? { id: { not: args.excludeAppointmentId } } : {};

    // 1. Capacidade do serviço no slot exato
    const serviceSlotUsage = await tx.appointment.count({
      where: {
        ...notSelf,
        unitId: args.unitId,
        serviceId: args.serviceId,
        startsAt: args.startsAt,
        status: { in: activeStatuses },
      },
    });

    // 3. Sobreposição com agendamentos que usam algum dos equipamentos solicitados
    const equipmentUsage: Record<string, number> = {};
    if (args.equipmentIds.length > 0) {
      const rows = await tx.appointment.findMany({
        where: {
          ...notSelf,
          unitId: args.unitId,
          status: { in: activeStatuses },
          startsAt: { lt: args.endsAt },
          endsAt: { gt: args.startsAt },
          equipments: { some: { equipmentId: { in: args.equipmentIds } } },
        },
        select: { equipments: { select: { equipmentId: true } } },
      });
      for (const id of args.equipmentIds) equipmentUsage[id] = 0;
      for (const row of rows) {
        for (const link of row.equipments) {
          if (args.equipmentIds.includes(link.equipmentId)) {
            equipmentUsage[link.equipmentId] = (equipmentUsage[link.equipmentId] ?? 0) + 1;
          }
        }
      }
    }

    // 6. Sobreposição com agendamentos do mesmo paciente
    const patientOverlapping = await tx.appointment.count({
      where: {
        ...notSelf,
        unitId: args.unitId,
        patientId: args.patientId,
        status: { in: activeStatuses },
        startsAt: { lt: args.endsAt },
        endsAt: { gt: args.startsAt },
      },
    });

    // 4c. Uso semanal para SUBSCRIPTION — quota é por semana DO agendamento
    // (segunda→domingo da semana de `startsAt`), não cumulativa a partir de hoje,
    // para que o agendamento recorrente em semanas futuras respeite a quota corretamente.
    let weeklyUsageForPlan = 0;
    if (args.planType === 'SUBSCRIPTION' && args.planId) {
      const weekStart = startOfWeekMonday(args.startsAt, args.unitTimezone);
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      weeklyUsageForPlan = await tx.appointment.count({
        where: {
          ...notSelf,
          planId: args.planId,
          status: { in: consumeStatuses },
          consumedSession: true,
          startsAt: { gte: weekStart, lt: weekEnd },
        },
      });
    }

    return { serviceSlotUsage, equipmentUsage, patientOverlapping, weeklyUsageForPlan };
  }

  private toResponse(
    row: AppointmentRow & { equipments: AppointmentEquipment[] },
  ): AppointmentResponse {
    return {
      id: row.id,
      unitId: row.unitId,
      patientId: row.patientId,
      serviceId: row.serviceId,
      planId: row.planId,
      professionalId: row.professionalId,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      status: row.status,
      consumedSession: row.consumedSession,
      checkedInAt: row.checkedInAt,
      completedAt: row.completedAt,
      cancelledAt: row.cancelledAt,
      cancelledById: row.cancelledById,
      cancellationReason: row.cancellationReason,
      revertedAt: row.revertedAt,
      revertedById: row.revertedById,
      equipmentIds: row.equipments.map((e) => e.equipmentId),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
