/**
 * Validadores puros da regra de capacidade do §4.3 do CLAUDE.md.
 *
 * Cada função recebe os dados pré-buscados e devolve `null` se passa, ou um
 * objeto `{ code, message }` se falha. A camada de service traduz o code em
 * exceção HTTP.
 *
 * Nada aqui toca o banco — pode ser exercitado em unit tests com objetos puros.
 */
import type { PlanStatus, PlanType } from '@rpx/shared';

export type ValidationFailure =
  | { code: 'SERVICE_INACTIVE'; message: string }
  | { code: 'SLOT_FULL'; message: string }
  | { code: 'EQUIPMENT_UNAVAILABLE'; message: string; equipmentId?: string }
  | { code: 'PLAN_NOT_USABLE'; message: string }
  | { code: 'PLAN_MISMATCH'; message: string }
  | { code: 'LEAD_TIME_VIOLATION'; message: string }
  | { code: 'PATIENT_CONFLICT'; message: string }
  | { code: 'INVALID_INTERVAL'; message: string };

export interface ServiceInfo {
  id: string;
  active: boolean;
  durationMinutes: number;
  slotCapacity: number;
  schedulingLeadMinutes: number;
  acceptedPlanType: PlanType;
}

export interface PlanInfo {
  id: string;
  patientId: string;
  serviceId: string;
  type: PlanType;
  status: PlanStatus;
  remainingSessions: number | null;
  validUntil: Date | null;
  weeklyQuota: number | null;
  startsAt: Date;
  endsAt: Date | null;
}

export interface EquipmentInfo {
  id: string;
  totalQuantity: number;
}

export interface CapacitySnapshot {
  /** Quantos agendamentos ATIVOS já existem no mesmo slot para o mesmo serviço. */
  serviceSlotUsage: number;
  /** Quantos agendamentos ATIVOS sobrepõem o intervalo e usam cada equipamento. */
  equipmentUsage: Record<string, number>;
  /** Quantos agendamentos ATIVOS o paciente já tem sobrepondo este intervalo. */
  patientOverlapping: number;
  /** Quantas sessões o paciente já tem usadas na semana corrente para o plano (SUBSCRIPTION). */
  weeklyUsageForPlan: number;
}

export interface ValidateAppointmentInput {
  now: Date;
  startsAt: Date;
  endsAt: Date;
  patientId: string;
  service: ServiceInfo;
  /** null = agendamento avulso (sem plano): pula os checks de plano. */
  plan: PlanInfo | null;
  equipmentIds: string[];
  equipments: EquipmentInfo[];
  snapshot: CapacitySnapshot;
}

/**
 * Ordem dos checks importa: validações mais baratas e óbvias primeiro,
 * para devolver erro útil antes de checks caros (equipamento).
 */
export function validateAppointment(input: ValidateAppointmentInput): ValidationFailure | null {
  const { now, startsAt, endsAt, service, plan, patientId, equipmentIds, equipments, snapshot } =
    input;

  // 0. Intervalo coerente com a duração do serviço
  if (startsAt.getTime() >= endsAt.getTime()) {
    return { code: 'INVALID_INTERVAL', message: 'startsAt deve ser estritamente menor que endsAt' };
  }
  const expectedEnd = startsAt.getTime() + service.durationMinutes * 60 * 1000;
  if (endsAt.getTime() !== expectedEnd) {
    return {
      code: 'INVALID_INTERVAL',
      message: `Duração não bate: serviço exige ${service.durationMinutes} min`,
    };
  }

  // 1. Serviço ativo
  if (!service.active) {
    return { code: 'SERVICE_INACTIVE', message: 'Serviço inativo, não aceita agendamentos.' };
  }

  // 5. Antecedência mínima
  const earliestStart = now.getTime() + service.schedulingLeadMinutes * 60 * 1000;
  if (startsAt.getTime() < earliestStart) {
    return {
      code: 'LEAD_TIME_VIOLATION',
      message: `Agendamento exige antecedência mínima de ${service.schedulingLeadMinutes} min.`,
    };
  }

  // 4. Plano — pulado em agendamento avulso (plan === null), ex.: Avaliação avulsa.
  if (plan) {
    // 4a. Plano usável + casa serviço + tipo
    if (plan.serviceId !== service.id) {
      return {
        code: 'PLAN_MISMATCH',
        message: 'O plano informado não pertence a este serviço.',
      };
    }
    if (plan.patientId !== patientId) {
      return {
        code: 'PLAN_MISMATCH',
        message: 'O plano informado não pertence a este paciente.',
      };
    }
    if (plan.type !== service.acceptedPlanType) {
      return {
        code: 'PLAN_MISMATCH',
        message: `Plano é ${plan.type} mas o serviço aceita ${service.acceptedPlanType}.`,
      };
    }
    if (plan.status !== 'ACTIVE') {
      return {
        code: 'PLAN_NOT_USABLE',
        message: `Plano em status ${plan.status} não permite novos agendamentos.`,
      };
    }
    if (plan.startsAt.getTime() > now.getTime()) {
      return { code: 'PLAN_NOT_USABLE', message: 'Plano ainda não começou.' };
    }
    if (plan.endsAt && plan.endsAt.getTime() <= now.getTime()) {
      return { code: 'PLAN_NOT_USABLE', message: 'Plano encerrado.' };
    }

    // 4b. PACKAGE: saldo > 0 e validade não vencida
    if (plan.type === 'PACKAGE') {
      if (plan.remainingSessions === null || plan.remainingSessions <= 0) {
        return { code: 'PLAN_NOT_USABLE', message: 'Pacote sem sessões disponíveis.' };
      }
      if (plan.validUntil && plan.validUntil.getTime() <= startsAt.getTime()) {
        return {
          code: 'PLAN_NOT_USABLE',
          message: 'Validade do pacote expira antes do horário escolhido.',
        };
      }
    }

    // 4c. SUBSCRIPTION: quota semanal disponível
    if (plan.type === 'SUBSCRIPTION') {
      if (plan.weeklyQuota === null) {
        return { code: 'PLAN_NOT_USABLE', message: 'Assinatura sem quota semanal configurada.' };
      }
      if (snapshot.weeklyUsageForPlan >= plan.weeklyQuota) {
        return {
          code: 'PLAN_NOT_USABLE',
          message: `Quota semanal de ${plan.weeklyQuota} agendamentos já foi atingida.`,
        };
      }
    }
  }

  // 6. Sem conflito do paciente em horário sobreposto
  if (snapshot.patientOverlapping > 0) {
    return {
      code: 'PATIENT_CONFLICT',
      message: 'Paciente já tem um agendamento ativo sobrepondo esse horário.',
    };
  }

  // 1. Capacidade do serviço no slot
  if (snapshot.serviceSlotUsage + 1 > service.slotCapacity) {
    return {
      code: 'SLOT_FULL',
      message: `Horário lotado para este serviço (capacidade ${service.slotCapacity}).`,
    };
  }

  // 3. Capacidade de cada equipamento solicitado
  const eqById = new Map(equipments.map((e) => [e.id, e] as const));
  for (const eqId of equipmentIds) {
    const inv = eqById.get(eqId);
    if (!inv) {
      return {
        code: 'EQUIPMENT_UNAVAILABLE',
        message: `Equipamento ${eqId} não encontrado.`,
        equipmentId: eqId,
      };
    }
    const used = snapshot.equipmentUsage[eqId] ?? 0;
    if (used + 1 > inv.totalQuantity) {
      return {
        code: 'EQUIPMENT_UNAVAILABLE',
        message: `Sem unidade disponível do equipamento (${eqId}) no horário escolhido.`,
        equipmentId: eqId,
      };
    }
  }

  return null;
}

export interface ValidateRescheduleInput {
  now: Date;
  startsAt: Date;
  endsAt: Date;
  service: ServiceInfo;
  equipmentIds: string[];
  equipments: EquipmentInfo[];
  snapshot: CapacitySnapshot;
}

/**
 * Validação de remarcação (drag-and-drop na agenda). Diferente de `validateAppointment`:
 * NÃO revalida saldo/quota do plano, porque a sessão já foi consumida na criação e a
 * remarcação só move o horário — não consome uma nova. Checa apenas os limites do
 * §4.3 que dependem do horário de destino: intervalo, serviço ativo, antecedência,
 * conflito do paciente, capacidade do slot e equipamentos.
 *
 * O `snapshot` deve ter sido coletado excluindo o próprio agendamento.
 */
export function validateReschedule(input: ValidateRescheduleInput): ValidationFailure | null {
  const { now, startsAt, endsAt, service, equipmentIds, equipments, snapshot } = input;

  if (startsAt.getTime() >= endsAt.getTime()) {
    return { code: 'INVALID_INTERVAL', message: 'startsAt deve ser estritamente menor que endsAt' };
  }
  const expectedEnd = startsAt.getTime() + service.durationMinutes * 60 * 1000;
  if (endsAt.getTime() !== expectedEnd) {
    return {
      code: 'INVALID_INTERVAL',
      message: `Duração não bate: serviço exige ${service.durationMinutes} min`,
    };
  }

  if (!service.active) {
    return { code: 'SERVICE_INACTIVE', message: 'Serviço inativo, não aceita agendamentos.' };
  }

  const earliestStart = now.getTime() + service.schedulingLeadMinutes * 60 * 1000;
  if (startsAt.getTime() < earliestStart) {
    return {
      code: 'LEAD_TIME_VIOLATION',
      message: `Remarcação exige antecedência mínima de ${service.schedulingLeadMinutes} min.`,
    };
  }

  if (snapshot.patientOverlapping > 0) {
    return {
      code: 'PATIENT_CONFLICT',
      message: 'Paciente já tem um agendamento ativo sobrepondo esse horário.',
    };
  }

  if (snapshot.serviceSlotUsage + 1 > service.slotCapacity) {
    return {
      code: 'SLOT_FULL',
      message: `Horário lotado para este serviço (capacidade ${service.slotCapacity}).`,
    };
  }

  const eqById = new Map(equipments.map((e) => [e.id, e] as const));
  for (const eqId of equipmentIds) {
    const inv = eqById.get(eqId);
    if (!inv) {
      return {
        code: 'EQUIPMENT_UNAVAILABLE',
        message: `Equipamento ${eqId} não encontrado.`,
        equipmentId: eqId,
      };
    }
    const used = snapshot.equipmentUsage[eqId] ?? 0;
    if (used + 1 > inv.totalQuantity) {
      return {
        code: 'EQUIPMENT_UNAVAILABLE',
        message: `Sem unidade disponível do equipamento (${eqId}) no horário escolhido.`,
        equipmentId: eqId,
      };
    }
  }

  return null;
}

/**
 * Considerar appointment "ativo" para fins de contagem de capacidade.
 * Status CANCELLED não conta. NO_SHOW conta — o paciente reservou o slot.
 */
export const ACTIVE_STATUSES_FOR_CAPACITY = [
  'SCHEDULED',
  'CONFIRMED',
  'CHECKED_IN',
  'COMPLETED',
] as const;

/**
 * Para fins de quota semanal de SUBSCRIPTION (saldo do plano), conta também NO_SHOW
 * porque o paciente "queimou" a sessão. Cancelados dentro do prazo já têm
 * consumedSession=false e não devem contar.
 */
export const STATUSES_THAT_CONSUME_QUOTA = [
  'SCHEDULED',
  'CONFIRMED',
  'CHECKED_IN',
  'COMPLETED',
  'NO_SHOW',
] as const;
