import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type BusinessHours as BusinessHoursRow,
  type ScheduleException as ScheduleExceptionRow,
} from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import type { CreateBusinessHoursRequest, CreateScheduleExceptionRequest, Slot } from '@rpx/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CLS_KEYS } from '../../common/cls/cls-keys';
import {
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/exceptions/app.exception';
import { fromZonedTime } from 'date-fns-tz';
import { generateSlots, type DayWindow } from './slot-generator';

@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  // ---------- BusinessHours ----------

  createBusinessHours(data: CreateBusinessHoursRequest): Promise<BusinessHoursRow> {
    return this.prisma.scoped.businessHours.create({
      data: data as unknown as Prisma.BusinessHoursUncheckedCreateInput,
    });
  }

  listBusinessHours(): Promise<BusinessHoursRow[]> {
    return this.prisma.scoped.businessHours.findMany({
      orderBy: [{ weekday: 'asc' }, { opensAt: 'asc' }],
    });
  }

  async removeBusinessHours(id: string): Promise<void> {
    const existing = await this.prisma.scoped.businessHours.findFirst({ where: { id } });
    if (!existing) throw new ResourceNotFoundException('Horário de funcionamento');
    await this.prisma.scoped.businessHours.delete({ where: { id } });
  }

  // ---------- ScheduleException ----------

  async createException(data: CreateScheduleExceptionRequest): Promise<ScheduleExceptionRow> {
    try {
      return await this.prisma.scoped.scheduleException.create({
        data: {
          date: data.date,
          type: data.type,
          opensAt: data.opensAt ?? null,
          closesAt: data.closesAt ?? null,
          reason: data.reason ?? null,
        } as unknown as Prisma.ScheduleExceptionUncheckedCreateInput,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ResourceConflictException(
          'Já existe uma exceção cadastrada para essa data nesta unidade.',
        );
      }
      throw err;
    }
  }

  listExceptions(): Promise<ScheduleExceptionRow[]> {
    return this.prisma.scoped.scheduleException.findMany({ orderBy: { date: 'asc' } });
  }

  async removeException(id: string): Promise<void> {
    const existing = await this.prisma.scoped.scheduleException.findFirst({ where: { id } });
    if (!existing) throw new ResourceNotFoundException('Exceção de horário');
    await this.prisma.scoped.scheduleException.delete({ where: { id } });
  }

  // ---------- slots ----------

  /**
   * `dateString` esperado em YYYY-MM-DD, interpretado no fuso da unidade
   * (não em UTC) para evitar deslize de calendário entre fusos.
   */
  async getSlots(
    serviceId: string,
    dateString: string,
  ): Promise<{
    date: string;
    timezone: string;
    serviceId: string;
    slots: Slot[];
  }> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      throw new Error('date deve estar em YYYY-MM-DD');
    }

    const service = await this.prisma.scoped.service.findFirst({ where: { id: serviceId } });
    if (!service) throw new ResourceNotFoundException('Serviço');

    const timezone = await this.unitTimezone();
    // Resolve o "meio-dia local" da data — fora de DST garante a data correta em qualquer TZ razoável.
    const dateInUnitTz = fromZonedTime(`${dateString}T12:00:00`, timezone);

    if (!service.active) {
      return { date: dateString, timezone, serviceId, slots: [] };
    }

    const windows = await this.windowsForDate(dateInUnitTz, timezone);
    const slots = generateSlots({
      date: dateInUnitTz,
      timezone,
      serviceDurationMinutes: service.durationMinutes,
      schedulingLeadMinutes: service.schedulingLeadMinutes,
      windows,
    });

    return { date: dateString, timezone, serviceId, slots };
  }

  // ---------- helpers ----------

  private async unitTimezone(): Promise<string> {
    const unitId = this.cls.get<string>(CLS_KEYS.UNIT_ID);
    if (!unitId) throw new Error('Unit context missing.');
    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      select: { timezone: true },
    });
    return unit?.timezone ?? 'America/Sao_Paulo';
  }

  /**
   * Janelas de funcionamento aplicáveis a uma data:
   * - Se houver exceção CLOSED para a data → sem janelas (sem slots).
   * - Se houver exceção CUSTOM → usa opensAt/closesAt da exceção.
   * - Caso contrário → BusinessHours do weekday correspondente.
   */
  private async windowsForDate(date: Date, timezone: string): Promise<DayWindow[]> {
    // Pega o YYYY-MM-DD no fuso da unidade e remonta como meia-noite UTC,
    // que é como o Postgres armazena colunas DATE.
    const localCal = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
    const y = localCal.getFullYear();
    const m = localCal.getMonth();
    const d = localCal.getDate();
    const dayOnlyUtc = new Date(Date.UTC(y, m, d, 0, 0, 0));

    const exception = await this.prisma.scoped.scheduleException.findFirst({
      where: { date: dayOnlyUtc },
    });

    if (exception) {
      if (exception.type === 'CLOSED') return [];
      return [{ opensAt: exception.opensAt!, closesAt: exception.closesAt! }];
    }

    // weekday no calendário local da unidade
    const weekday = new Date(y, m, d).getDay();
    const hours = await this.prisma.scoped.businessHours.findMany({
      where: { weekday },
      orderBy: { opensAt: 'asc' },
    });
    return hours.map((h) => ({ opensAt: h.opensAt, closesAt: h.closesAt }));
  }
}
