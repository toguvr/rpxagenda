import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type BusinessHours as BusinessHoursRow,
  type ScheduleException as ScheduleExceptionRow,
} from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import type { CreateBusinessHoursRequest, CreateScheduleExceptionRequest, Slot } from '@rpx/shared';
import { fromZonedTime } from 'date-fns-tz';
import { PrismaService } from '../../prisma/prisma.service';
import { CLS_KEYS } from '../../common/cls/cls-keys';
import {
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/exceptions/app.exception';
import { generateSlots, type DayWindow } from './slot-generator';

@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  // ---------- BusinessHours (por serviço) ----------

  async createBusinessHours(
    serviceId: string,
    data: CreateBusinessHoursRequest,
  ): Promise<BusinessHoursRow> {
    await this.assertServiceExists(serviceId);
    return this.prisma.scoped.businessHours.create({
      data: { ...data, serviceId } as unknown as Prisma.BusinessHoursUncheckedCreateInput,
    });
  }

  async listBusinessHoursForService(serviceId: string): Promise<BusinessHoursRow[]> {
    await this.assertServiceExists(serviceId);
    return this.prisma.scoped.businessHours.findMany({
      where: { serviceId },
      orderBy: [{ weekday: 'asc' }, { opensAt: 'asc' }],
    });
  }

  async removeBusinessHours(id: string): Promise<void> {
    const existing = await this.prisma.scoped.businessHours.findFirst({ where: { id } });
    if (!existing) throw new ResourceNotFoundException('Horário de funcionamento');
    await this.prisma.scoped.businessHours.delete({ where: { id } });
  }

  // ---------- ScheduleException (por unidade) ----------

  async createException(data: CreateScheduleExceptionRequest): Promise<ScheduleExceptionRow> {
    if (data.serviceId) {
      await this.assertServiceExists(data.serviceId);
    }
    // Guarda contra duplicidade (o índice único cobre serviceId não-nulo; aqui também
    // cobrimos o caso unidade-inteira, em que NULLs são distintos no índice do Postgres).
    const existing = await this.prisma.scoped.scheduleException.findFirst({
      where: { date: data.date, serviceId: data.serviceId ?? null },
    });
    if (existing) {
      throw new ResourceConflictException(
        data.serviceId
          ? 'Já existe uma exceção para esse serviço nessa data.'
          : 'Já existe uma exceção da unidade inteira nessa data.',
      );
    }
    try {
      return await this.prisma.scoped.scheduleException.create({
        data: {
          date: data.date,
          serviceId: data.serviceId ?? null,
          type: data.type,
          opensAt: data.opensAt ?? null,
          closesAt: data.closesAt ?? null,
          reason: data.reason ?? null,
        } as unknown as Prisma.ScheduleExceptionUncheckedCreateInput,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ResourceConflictException('Já existe uma exceção cadastrada para essa data.');
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
    const dateInUnitTz = fromZonedTime(`${dateString}T12:00:00`, timezone);

    if (!service.active) {
      return { date: dateString, timezone, serviceId, slots: [] };
    }

    const windows = await this.windowsForService(serviceId, dateInUnitTz, timezone);
    const slots = generateSlots({
      date: dateInUnitTz,
      timezone,
      serviceDurationMinutes: service.durationMinutes,
      schedulingLeadMinutes: service.schedulingLeadMinutes,
      windows,
    });

    return { date: dateString, timezone, serviceId, slots };
  }

  /**
   * Dias (YYYY-MM-DD) no intervalo [from, to] em que o serviço tem ao menos um
   * slot gerável (mesma semântica de getSlots: janelas de funcionamento + lead,
   * sem considerar capacidade/lotação). Usado pelo app para só mostrar dias com
   * horário no seletor de data.
   */
  async getAvailableDays(
    serviceId: string,
    fromString: string,
    toString: string,
  ): Promise<{ timezone: string; serviceId: string; days: string[] }> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromString) || !/^\d{4}-\d{2}-\d{2}$/.test(toString)) {
      throw new Error('from/to devem estar em YYYY-MM-DD');
    }
    const service = await this.prisma.scoped.service.findFirst({ where: { id: serviceId } });
    if (!service) throw new ResourceNotFoundException('Serviço');

    const timezone = await this.unitTimezone();
    const days: string[] = [];
    if (!service.active) return { timezone, serviceId, days };

    for (const dateString of enumerateDates(fromString, toString)) {
      const dateInUnitTz = fromZonedTime(`${dateString}T12:00:00`, timezone);
      const windows = await this.windowsForService(serviceId, dateInUnitTz, timezone);
      if (windows.length === 0) continue;
      const slots = generateSlots({
        date: dateInUnitTz,
        timezone,
        serviceDurationMinutes: service.durationMinutes,
        schedulingLeadMinutes: service.schedulingLeadMinutes,
        windows,
      });
      if (slots.length > 0) days.push(dateString);
    }
    return { timezone, serviceId, days };
  }

  // ---------- helpers ----------

  private async assertServiceExists(serviceId: string): Promise<void> {
    const svc = await this.prisma.scoped.service.findFirst({
      where: { id: serviceId },
      select: { id: true },
    });
    if (!svc) throw new ResourceNotFoundException('Serviço');
  }

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
   * Janelas de funcionamento aplicáveis a um serviço numa data:
   * - Exceções de calendário têm precedência. Entre elas, a mais específica vence:
   *   uma exceção do próprio serviço sobrepõe a da unidade inteira.
   *   - tipo CLOSED → sem janelas (serviço fica sem slots no dia).
   *   - tipo CUSTOM → usa opensAt/closesAt da exceção.
   * - Sem exceção aplicável → BusinessHours do (serviceId, weekday).
   */
  private async windowsForService(
    serviceId: string,
    date: Date,
    timezone: string,
  ): Promise<DayWindow[]> {
    const localCal = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
    const y = localCal.getFullYear();
    const m = localCal.getMonth();
    const d = localCal.getDate();
    const dayOnlyUtc = new Date(Date.UTC(y, m, d, 0, 0, 0));

    const exceptions = await this.prisma.scoped.scheduleException.findMany({
      where: { date: dayOnlyUtc, OR: [{ serviceId: null }, { serviceId }] },
    });
    // Mais específica primeiro: exceção do serviço > exceção da unidade inteira.
    const exception =
      exceptions.find((e) => e.serviceId === serviceId) ??
      exceptions.find((e) => e.serviceId === null);

    if (exception) {
      if (exception.type === 'CLOSED') return [];
      return [{ opensAt: exception.opensAt!, closesAt: exception.closesAt! }];
    }

    const weekday = new Date(y, m, d).getDay();
    const hours = await this.prisma.scoped.businessHours.findMany({
      where: { serviceId, weekday },
      orderBy: { opensAt: 'asc' },
    });
    return hours.map((h) => ({ opensAt: h.opensAt, closesAt: h.closesAt }));
  }
}

/** Lista de datas YYYY-MM-DD de `from` a `to` (inclusive). Âncora ao meio-dia UTC evita deslize por DST. */
function enumerateDates(fromString: string, toString: string): string[] {
  const [fy, fm, fd] = fromString.split('-').map(Number);
  const [ty, tm, td] = toString.split('-').map(Number);
  let cur = Date.UTC(fy, fm - 1, fd, 12, 0, 0);
  const end = Date.UTC(ty, tm - 1, td, 12, 0, 0);
  const out: string[] = [];
  for (let guard = 0; cur <= end && guard < 120; guard++) {
    out.push(new Date(cur).toISOString().slice(0, 10));
    cur += 86_400_000;
  }
  return out;
}
