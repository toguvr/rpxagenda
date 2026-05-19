import {
  buildQuotaStatus,
  deriveExpectedStatus,
  isPlanUsable,
  type PlanLike,
} from './plan-helpers';

const T = (offsetMs: number) => new Date(Date.now() + offsetMs);
const future = T(7 * 24 * 60 * 60 * 1000);
const past = T(-7 * 24 * 60 * 60 * 1000);

const baseActivePackage: PlanLike = {
  type: 'PACKAGE',
  status: 'ACTIVE',
  totalSessions: 20,
  remainingSessions: 10,
  validUntil: future,
  weeklyQuota: null,
  startsAt: past,
  endsAt: null,
};

const baseActiveSubscription: PlanLike = {
  type: 'SUBSCRIPTION',
  status: 'ACTIVE',
  totalSessions: null,
  remainingSessions: null,
  validUntil: null,
  weeklyQuota: 3,
  startsAt: past,
  endsAt: null,
};

describe('isPlanUsable', () => {
  it('PACKAGE ativo com saldo e validade no futuro é usável', () => {
    expect(isPlanUsable(baseActivePackage)).toBe(true);
  });

  it('PACKAGE com saldo zerado não é usável', () => {
    expect(isPlanUsable({ ...baseActivePackage, remainingSessions: 0 })).toBe(false);
  });

  it('PACKAGE com validade vencida não é usável', () => {
    expect(isPlanUsable({ ...baseActivePackage, validUntil: past })).toBe(false);
  });

  it('SUBSCRIPTION ativa é usável (sem saldo decrementável)', () => {
    expect(isPlanUsable(baseActiveSubscription)).toBe(true);
  });

  it('qualquer status != ACTIVE bloqueia', () => {
    for (const status of [
      'PENDING_PAYMENT',
      'PAST_DUE',
      'SUSPENDED',
      'EXPIRED',
      'CANCELLED',
    ] as const) {
      expect(isPlanUsable({ ...baseActivePackage, status })).toBe(false);
    }
  });

  it('startsAt no futuro bloqueia', () => {
    expect(isPlanUsable({ ...baseActivePackage, startsAt: future })).toBe(false);
  });

  it('endsAt no passado bloqueia', () => {
    expect(isPlanUsable({ ...baseActivePackage, endsAt: past })).toBe(false);
  });
});

describe('deriveExpectedStatus', () => {
  it('PACKAGE com saldo zerado deveria virar EXPIRED', () => {
    expect(deriveExpectedStatus({ ...baseActivePackage, remainingSessions: 0 })).toBe('EXPIRED');
  });

  it('PACKAGE com validade vencida deveria virar EXPIRED', () => {
    expect(deriveExpectedStatus({ ...baseActivePackage, validUntil: past })).toBe('EXPIRED');
  });

  it('status terminais não mudam', () => {
    expect(deriveExpectedStatus({ ...baseActivePackage, status: 'CANCELLED' })).toBe('CANCELLED');
    expect(deriveExpectedStatus({ ...baseActivePackage, status: 'SUSPENDED' })).toBe('SUSPENDED');
    expect(deriveExpectedStatus({ ...baseActivePackage, status: 'PENDING_PAYMENT' })).toBe(
      'PENDING_PAYMENT',
    );
  });

  it('SUBSCRIPTION com endsAt no passado vira EXPIRED', () => {
    expect(deriveExpectedStatus({ ...baseActiveSubscription, endsAt: past })).toBe('EXPIRED');
  });
});

describe('buildQuotaStatus', () => {
  it('SUBSCRIPTION com quota 3 e uso 1 → restam 2', () => {
    const q = buildQuotaStatus(baseActiveSubscription, 1);
    expect(q).toEqual({ weeklyQuota: 3, weeklyUsage: 1, weeklyRemaining: 2 });
  });

  it('uso >= quota → remaining 0 (não negativo)', () => {
    const q = buildQuotaStatus(baseActiveSubscription, 5);
    expect(q).toEqual({ weeklyQuota: 3, weeklyUsage: 5, weeklyRemaining: 0 });
  });

  it('PACKAGE não tem quota semanal — devolve nulls', () => {
    const q = buildQuotaStatus(baseActivePackage, 2);
    expect(q).toEqual({ weeklyQuota: null, weeklyUsage: 0, weeklyRemaining: null });
  });
});
