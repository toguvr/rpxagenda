import {
  validateAppointment,
  validateReschedule,
  type CapacitySnapshot,
  type EquipmentInfo,
  type PlanInfo,
  type ServiceInfo,
  type ValidateAppointmentInput,
  type ValidateRescheduleInput,
} from './capacity-validators';

const NOW = new Date('2026-05-19T12:00:00Z');
const STARTS = new Date('2026-05-19T14:00:00Z'); // 2h depois de NOW
const ENDS = new Date('2026-05-19T14:50:00Z'); // 50min depois (Fisio)

const baseService: ServiceInfo = {
  id: 'svc_fisio',
  active: true,
  durationMinutes: 50,
  slotCapacity: 5,
  schedulingLeadMinutes: 60,
  acceptedPlanType: 'PACKAGE',
};

const basePackagePlan: PlanInfo = {
  id: 'plan_pkg',
  patientId: 'pat_1',
  serviceId: 'svc_fisio',
  type: 'PACKAGE',
  status: 'ACTIVE',
  remainingSessions: 10,
  validUntil: new Date('2026-09-30T00:00:00Z'),
  weeklyQuota: null,
  startsAt: new Date('2026-05-01T00:00:00Z'),
  endsAt: null,
};

const baseEquipments: EquipmentInfo[] = [
  { id: 'eq_maca', totalQuantity: 3 },
  { id: 'eq_bola', totalQuantity: 1 },
];

const emptySnapshot: CapacitySnapshot = {
  serviceSlotUsage: 0,
  equipmentUsage: {},
  patientOverlapping: 0,
  weeklyUsageForPlan: 0,
};

function buildInput(overrides: Partial<ValidateAppointmentInput> = {}): ValidateAppointmentInput {
  return {
    now: NOW,
    startsAt: STARTS,
    endsAt: ENDS,
    patientId: 'pat_1',
    service: baseService,
    plan: basePackagePlan,
    equipmentIds: [],
    equipments: baseEquipments,
    snapshot: emptySnapshot,
    ...overrides,
  };
}

describe('validateAppointment', () => {
  it('caso feliz mínimo (sem equipamento) → null', () => {
    expect(validateAppointment(buildInput())).toBeNull();
  });

  it('caso feliz com equipamentos disponíveis → null', () => {
    expect(
      validateAppointment(
        buildInput({
          equipmentIds: ['eq_maca'],
          snapshot: { ...emptySnapshot, equipmentUsage: { eq_maca: 1 } },
        }),
      ),
    ).toBeNull();
  });

  it('INVALID_INTERVAL quando endsAt <= startsAt', () => {
    const f = validateAppointment(buildInput({ endsAt: STARTS }));
    expect(f?.code).toBe('INVALID_INTERVAL');
  });

  it('INVALID_INTERVAL quando duração não bate com o serviço', () => {
    const wrongEnd = new Date(STARTS.getTime() + 30 * 60 * 1000); // 30 min, serviço exige 50
    const f = validateAppointment(buildInput({ endsAt: wrongEnd }));
    expect(f?.code).toBe('INVALID_INTERVAL');
  });

  it('SERVICE_INACTIVE quando serviço desativado', () => {
    const f = validateAppointment(buildInput({ service: { ...baseService, active: false } }));
    expect(f?.code).toBe('SERVICE_INACTIVE');
  });

  it('LEAD_TIME_VIOLATION quando startsAt < now + lead', () => {
    // startsAt = now + 30 min, lead = 60 min → falha
    const tooSoon = new Date(NOW.getTime() + 30 * 60 * 1000);
    const f = validateAppointment(
      buildInput({
        startsAt: tooSoon,
        endsAt: new Date(tooSoon.getTime() + 50 * 60 * 1000),
      }),
    );
    expect(f?.code).toBe('LEAD_TIME_VIOLATION');
  });

  it('PLAN_MISMATCH se plano é de outro serviço', () => {
    const f = validateAppointment(buildInput({ plan: { ...basePackagePlan, serviceId: 'outro' } }));
    expect(f?.code).toBe('PLAN_MISMATCH');
  });

  it('PLAN_MISMATCH se plano é de outro paciente', () => {
    const f = validateAppointment(buildInput({ plan: { ...basePackagePlan, patientId: 'outro' } }));
    expect(f?.code).toBe('PLAN_MISMATCH');
  });

  it('PLAN_MISMATCH se type do plano não bate com acceptedPlanType', () => {
    const f = validateAppointment(
      buildInput({
        plan: {
          ...basePackagePlan,
          type: 'SUBSCRIPTION',
          weeklyQuota: 3,
          remainingSessions: null,
        },
      }),
    );
    expect(f?.code).toBe('PLAN_MISMATCH');
  });

  it('PLAN_NOT_USABLE se status do plano != ACTIVE', () => {
    const f = validateAppointment(
      buildInput({ plan: { ...basePackagePlan, status: 'SUSPENDED' } }),
    );
    expect(f?.code).toBe('PLAN_NOT_USABLE');
  });

  it('PLAN_NOT_USABLE PACKAGE sem saldo', () => {
    const f = validateAppointment(
      buildInput({ plan: { ...basePackagePlan, remainingSessions: 0 } }),
    );
    expect(f?.code).toBe('PLAN_NOT_USABLE');
  });

  it('PLAN_NOT_USABLE PACKAGE com validade anterior ao slot', () => {
    const expired = new Date(STARTS.getTime() - 1000);
    const f = validateAppointment(
      buildInput({ plan: { ...basePackagePlan, validUntil: expired } }),
    );
    expect(f?.code).toBe('PLAN_NOT_USABLE');
  });

  it('PLAN_NOT_USABLE SUBSCRIPTION com quota esgotada', () => {
    const subService: ServiceInfo = {
      ...baseService,
      id: 'svc_musc',
      acceptedPlanType: 'SUBSCRIPTION',
      durationMinutes: 60,
    };
    const subPlan: PlanInfo = {
      ...basePackagePlan,
      id: 'plan_sub',
      serviceId: 'svc_musc',
      type: 'SUBSCRIPTION',
      remainingSessions: null,
      validUntil: null,
      weeklyQuota: 3,
    };
    const subStarts = new Date('2026-05-19T14:00:00Z');
    const subEnds = new Date(subStarts.getTime() + 60 * 60 * 1000);
    const f = validateAppointment(
      buildInput({
        service: subService,
        plan: subPlan,
        startsAt: subStarts,
        endsAt: subEnds,
        snapshot: { ...emptySnapshot, weeklyUsageForPlan: 3 },
      }),
    );
    expect(f?.code).toBe('PLAN_NOT_USABLE');
    expect(f?.message).toMatch(/quota semanal/i);
  });

  it('SLOT_FULL quando capacidade do serviço esgotada', () => {
    const f = validateAppointment(
      buildInput({ snapshot: { ...emptySnapshot, serviceSlotUsage: 5 } }),
    );
    expect(f?.code).toBe('SLOT_FULL');
  });

  it('PATIENT_CONFLICT quando paciente já tem agendamento sobreposto', () => {
    const f = validateAppointment(
      buildInput({ snapshot: { ...emptySnapshot, patientOverlapping: 1 } }),
    );
    expect(f?.code).toBe('PATIENT_CONFLICT');
  });

  it('EQUIPMENT_UNAVAILABLE quando equipamento não existe no mapa', () => {
    const f = validateAppointment(buildInput({ equipmentIds: ['eq_fantasma'] }));
    expect(f?.code).toBe('EQUIPMENT_UNAVAILABLE');
  });

  it('EQUIPMENT_UNAVAILABLE quando inventário do equipamento está cheio', () => {
    // eq_bola tem totalQuantity=1; já com 1 em uso, novo agendamento estoura.
    const f = validateAppointment(
      buildInput({
        equipmentIds: ['eq_bola'],
        snapshot: { ...emptySnapshot, equipmentUsage: { eq_bola: 1 } },
      }),
    );
    expect(f?.code).toBe('EQUIPMENT_UNAVAILABLE');
    expect((f as { equipmentId?: string }).equipmentId).toBe('eq_bola');
  });

  it('passa quando equipamento ainda tem espaço (inventário 3, uso 2)', () => {
    expect(
      validateAppointment(
        buildInput({
          equipmentIds: ['eq_maca'],
          snapshot: { ...emptySnapshot, equipmentUsage: { eq_maca: 2 } },
        }),
      ),
    ).toBeNull();
  });
});

function buildReschedule(
  overrides: Partial<ValidateRescheduleInput> = {},
): ValidateRescheduleInput {
  return {
    now: NOW,
    startsAt: STARTS,
    endsAt: ENDS,
    service: baseService,
    equipmentIds: [],
    equipments: baseEquipments,
    snapshot: emptySnapshot,
    ...overrides,
  };
}

describe('validateReschedule', () => {
  it('caso feliz → null', () => {
    expect(validateReschedule(buildReschedule())).toBeNull();
  });

  it('INVALID_INTERVAL quando duração não bate com o serviço', () => {
    const wrongEnd = new Date(STARTS.getTime() + 30 * 60 * 1000);
    const f = validateReschedule(buildReschedule({ endsAt: wrongEnd }));
    expect(f?.code).toBe('INVALID_INTERVAL');
  });

  it('SERVICE_INACTIVE quando serviço desativado', () => {
    const f = validateReschedule(buildReschedule({ service: { ...baseService, active: false } }));
    expect(f?.code).toBe('SERVICE_INACTIVE');
  });

  it('LEAD_TIME_VIOLATION quando novo horário fere a antecedência mínima', () => {
    const tooSoon = new Date(NOW.getTime() + 30 * 60 * 1000);
    const f = validateReschedule(
      buildReschedule({
        startsAt: tooSoon,
        endsAt: new Date(tooSoon.getTime() + 50 * 60 * 1000),
      }),
    );
    expect(f?.code).toBe('LEAD_TIME_VIOLATION');
  });

  it('SLOT_FULL quando capacidade do serviço esgotada', () => {
    const f = validateReschedule(
      buildReschedule({ snapshot: { ...emptySnapshot, serviceSlotUsage: 5 } }),
    );
    expect(f?.code).toBe('SLOT_FULL');
  });

  it('PATIENT_CONFLICT quando paciente já tem agendamento sobreposto', () => {
    const f = validateReschedule(
      buildReschedule({ snapshot: { ...emptySnapshot, patientOverlapping: 1 } }),
    );
    expect(f?.code).toBe('PATIENT_CONFLICT');
  });

  it('EQUIPMENT_UNAVAILABLE quando inventário do equipamento está cheio', () => {
    const f = validateReschedule(
      buildReschedule({
        equipmentIds: ['eq_bola'],
        snapshot: { ...emptySnapshot, equipmentUsage: { eq_bola: 1 } },
      }),
    );
    expect(f?.code).toBe('EQUIPMENT_UNAVAILABLE');
  });

  it('NÃO revalida saldo/quota do plano (remarcação não reconsome a sessão)', () => {
    // Diferente de validateAppointment: mesmo com o slot cheio de uso do plano,
    // reschedule só olha capacidade/horário — passa porque a sessão já foi consumida.
    expect(
      validateReschedule(
        buildReschedule({ snapshot: { ...emptySnapshot, weeklyUsageForPlan: 99 } }),
      ),
    ).toBeNull();
  });
});
