import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { fromZonedTime } from 'date-fns-tz';
import type { DashboardSummary } from '@rpx/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CLS_KEYS } from '../../common/cls/cls-keys';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async summary(): Promise<DashboardSummary> {
    const unitId = this.cls.get<string>(CLS_KEYS.UNIT_ID);
    if (!unitId) throw new Error('Unit context missing.');

    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      select: { timezone: true },
    });
    const tz = unit?.timezone ?? 'America/Sao_Paulo';

    const now = new Date();
    const todayLocal = now.toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD
    const todayStart = fromZonedTime(`${todayLocal}T00:00:00`, tz);
    const todayEnd = new Date(todayStart.getTime() + 86_400_000);
    const monthStart = fromZonedTime(`${todayLocal.slice(0, 7)}-01T00:00:00`, tz);
    const last7Start = new Date(todayStart.getTime() - 6 * 86_400_000);
    const thirtyAgo = new Date(now.getTime() - 30 * 86_400_000);
    const in30 = new Date(now.getTime() + 30 * 86_400_000);

    const [
      todayAppts,
      patientsTotal,
      newThisMonth,
      activePlans,
      planStatuses,
      completed30,
      noShow30,
      last7Appts,
      monthAppts,
    ] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { unitId, startsAt: { gte: todayStart, lt: todayEnd } },
        select: { status: true },
      }),
      this.prisma.patient.count({ where: { unitId } }),
      this.prisma.patient.count({ where: { unitId, createdAt: { gte: monthStart } } }),
      this.prisma.plan.findMany({
        where: { unitId, status: 'ACTIVE' },
        select: {
          id: true,
          type: true,
          validUntil: true,
          remainingSessions: true,
          patientId: true,
          patient: { select: { fullName: true } },
          service: { select: { name: true } },
        },
      }),
      this.prisma.plan.findMany({ where: { unitId }, select: { status: true } }),
      this.prisma.appointment.count({
        where: { unitId, status: 'COMPLETED', startsAt: { gte: thirtyAgo } },
      }),
      this.prisma.appointment.count({
        where: { unitId, status: 'NO_SHOW', startsAt: { gte: thirtyAgo } },
      }),
      this.prisma.appointment.findMany({
        where: {
          unitId,
          startsAt: { gte: last7Start, lt: todayEnd },
          status: { not: 'CANCELLED' },
        },
        select: { startsAt: true },
      }),
      this.prisma.appointment.findMany({
        where: { unitId, startsAt: { gte: monthStart }, status: { not: 'CANCELLED' } },
        select: { service: { select: { name: true } } },
      }),
    ]);

    const today = {
      total: todayAppts.length,
      scheduled: 0,
      confirmed: 0,
      checkedIn: 0,
      completed: 0,
      cancelled: 0,
      noShow: 0,
    };
    for (const a of todayAppts) {
      if (a.status === 'SCHEDULED') today.scheduled++;
      else if (a.status === 'CONFIRMED') today.confirmed++;
      else if (a.status === 'CHECKED_IN') today.checkedIn++;
      else if (a.status === 'COMPLETED') today.completed++;
      else if (a.status === 'CANCELLED') today.cancelled++;
      else if (a.status === 'NO_SHOW') today.noShow++;
    }

    const plans = { active: 0, pendingPayment: 0, pastDue: 0, suspended: 0, expiringSoon: 0 };
    for (const p of planStatuses) {
      if (p.status === 'ACTIVE') plans.active++;
      else if (p.status === 'PENDING_PAYMENT') plans.pendingPayment++;
      else if (p.status === 'PAST_DUE') plans.pastDue++;
      else if (p.status === 'SUSPENDED') plans.suspended++;
    }

    const activePatientIds = new Set<string>();
    const expiringPlans: DashboardSummary['alerts']['expiringPlans'] = [];
    const lowBalancePlans: DashboardSummary['alerts']['lowBalancePlans'] = [];
    for (const p of activePlans) {
      activePatientIds.add(p.patientId);
      if (p.type === 'PACKAGE' && p.validUntil && p.validUntil <= in30) {
        plans.expiringSoon++;
        expiringPlans.push({
          id: p.id,
          patientId: p.patientId,
          patientName: p.patient.fullName,
          serviceName: p.service.name,
          validUntil: p.validUntil.toISOString(),
          remainingSessions: p.remainingSessions,
        });
      }
      if (
        p.type === 'PACKAGE' &&
        p.remainingSessions != null &&
        p.remainingSessions > 0 &&
        p.remainingSessions <= 2
      ) {
        lowBalancePlans.push({
          id: p.id,
          patientId: p.patientId,
          patientName: p.patient.fullName,
          serviceName: p.service.name,
          remainingSessions: p.remainingSessions,
        });
      }
    }
    expiringPlans.sort((a, b) => a.validUntil.localeCompare(b.validUntil));

    const [y, mo, d] = todayLocal.split('-').map(Number);
    const baseNoon = Date.UTC(y, mo - 1, d, 12, 0, 0);
    const dailyCounts = new Map<string, number>();
    for (const a of last7Appts) {
      const key = a.startsAt.toLocaleDateString('en-CA', { timeZone: tz });
      dailyCounts.set(key, (dailyCounts.get(key) ?? 0) + 1);
    }
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(baseNoon - (6 - i) * 86_400_000).toISOString().slice(0, 10);
      return { date, count: dailyCounts.get(date) ?? 0 };
    });

    const svcCounts = new Map<string, number>();
    for (const a of monthAppts) {
      svcCounts.set(a.service.name, (svcCounts.get(a.service.name) ?? 0) + 1);
    }
    const byService = Array.from(svcCounts.entries())
      .map(([service, count]) => ({ service, count }))
      .sort((a, b) => b.count - a.count);

    const rate = completed30 + noShow30 > 0 ? completed30 / (completed30 + noShow30) : 0;

    return {
      today,
      patients: { total: patientsTotal, withActivePlan: activePatientIds.size, newThisMonth },
      plans,
      attendance30d: { completed: completed30, noShow: noShow30, rate },
      last7Days,
      byService,
      alerts: {
        expiringPlans: expiringPlans.slice(0, 6),
        lowBalancePlans: lowBalancePlans.slice(0, 6),
      },
    };
  }
}
