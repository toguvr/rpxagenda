/**
 * Helpers puros para regras de plano (saldo, expiração, quota semanal).
 * Mantidos como funções sem dependência de Prisma para serem fáceis de testar.
 */
import type { PlanStatus, PlanType } from '@rpx/shared';

export interface PlanLike {
  type: PlanType;
  status: PlanStatus;
  totalSessions: number | null;
  remainingSessions: number | null;
  validUntil: Date | null;
  weeklyQuota: number | null;
  startsAt: Date;
  endsAt: Date | null;
}

export interface QuotaStatus {
  /** Capacidade total da semana (apenas SUBSCRIPTION). */
  weeklyQuota: number | null;
  /** Agendamentos já consumidos na semana corrente. */
  weeklyUsage: number;
  /** Saldo restante na semana (quota - usage). */
  weeklyRemaining: number | null;
}

/**
 * Verifica se um plano está em estado utilizável para agendar uma nova sessão.
 * Não checa quota (isso é responsabilidade do caller); apenas estado + validade.
 */
export function isPlanUsable(plan: PlanLike, now: Date = new Date()): boolean {
  if (plan.status !== 'ACTIVE') return false;
  if (plan.startsAt.getTime() > now.getTime()) return false;
  if (plan.endsAt && plan.endsAt.getTime() <= now.getTime()) return false;

  if (plan.type === 'PACKAGE') {
    if (plan.validUntil && plan.validUntil.getTime() <= now.getTime()) return false;
    if (plan.remainingSessions !== null && plan.remainingSessions <= 0) return false;
  }
  return true;
}

/**
 * Próximo status que um PACKAGE deveria assumir dado o saldo e validade.
 * Útil para um job de manutenção (Fase 8) e para validar gravações manuais.
 */
export function deriveExpectedStatus(plan: PlanLike, now: Date = new Date()): PlanStatus {
  if (
    plan.status === 'CANCELLED' ||
    plan.status === 'SUSPENDED' ||
    plan.status === 'PENDING_PAYMENT'
  ) {
    return plan.status;
  }
  if (plan.type === 'PACKAGE') {
    if (plan.remainingSessions !== null && plan.remainingSessions <= 0) return 'EXPIRED';
    if (plan.validUntil && plan.validUntil.getTime() <= now.getTime()) return 'EXPIRED';
  }
  if (plan.endsAt && plan.endsAt.getTime() <= now.getTime()) return 'EXPIRED';
  return plan.status;
}

/**
 * Calcula o saldo semanal de um SUBSCRIPTION dado o número de agendamentos
 * ATIVOS (não cancelados) na semana corrente.
 */
export function buildQuotaStatus(plan: PlanLike, weeklyUsage: number): QuotaStatus {
  if (plan.type !== 'SUBSCRIPTION' || plan.weeklyQuota === null) {
    return { weeklyQuota: null, weeklyUsage: 0, weeklyRemaining: null };
  }
  return {
    weeklyQuota: plan.weeklyQuota,
    weeklyUsage,
    weeklyRemaining: Math.max(0, plan.weeklyQuota - weeklyUsage),
  };
}
