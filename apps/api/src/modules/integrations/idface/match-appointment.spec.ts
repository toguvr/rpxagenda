import { pickEligibleAppointment, type MatchableAppointment } from './match-appointment';

const NOW = new Date('2026-05-19T14:00:00Z');

function appt(overrides: Partial<MatchableAppointment>): MatchableAppointment {
  return {
    id: 'a',
    startsAt: new Date('2026-05-19T14:00:00Z'),
    endsAt: new Date('2026-05-19T14:50:00Z'),
    status: 'SCHEDULED',
    service: { checkInWindowBeforeMin: 30, checkInWindowAfterMin: 15 },
    ...overrides,
  };
}

describe('pickEligibleAppointment', () => {
  it('escolhe appointment quando now está dentro da janela', () => {
    expect(pickEligibleAppointment([appt({ id: 'A' })], NOW)?.id).toBe('A');
  });

  it('escolhe quando paciente chega antes da hora (dentro do before)', () => {
    // startsAt = 14:20, before = 30min → janela começa 13:50
    const a = appt({
      id: 'early',
      startsAt: new Date('2026-05-19T14:20:00Z'),
      endsAt: new Date('2026-05-19T15:10:00Z'),
    });
    expect(pickEligibleAppointment([a], NOW)?.id).toBe('early');
  });

  it('escolhe quando paciente chega no fim da janela depois (dentro do after)', () => {
    // startsAt = 13:50, after = 15min → janela termina 14:05
    const a = appt({
      id: 'late',
      startsAt: new Date('2026-05-19T13:50:00Z'),
      endsAt: new Date('2026-05-19T14:40:00Z'),
    });
    expect(pickEligibleAppointment([a], NOW)?.id).toBe('late');
  });

  it('rejeita appointment fora da janela (chegou tarde demais)', () => {
    // startsAt = 13:30, after = 15min → janela termina 13:45, NOW=14:00 → fora
    const a = appt({
      id: 'too-late',
      startsAt: new Date('2026-05-19T13:30:00Z'),
      endsAt: new Date('2026-05-19T14:20:00Z'),
    });
    expect(pickEligibleAppointment([a], NOW)).toBeNull();
  });

  it('aceita NO_SHOW dentro da janela (reversão por chegada tardia)', () => {
    // Cron marcou NO_SHOW antes do paciente chegar, mas após-window ainda aberto.
    // Para isso, after deve ser maior que o normal — configurável por serviço.
    const a = appt({
      id: 'reverted',
      startsAt: new Date('2026-05-19T13:00:00Z'),
      endsAt: new Date('2026-05-19T13:50:00Z'),
      status: 'NO_SHOW',
      service: { checkInWindowBeforeMin: 30, checkInWindowAfterMin: 120 }, // 2h after
    });
    expect(pickEligibleAppointment([a], NOW)?.id).toBe('reverted');
  });

  it('rejeita CHECKED_IN / COMPLETED / CANCELLED', () => {
    const candidates = [
      appt({ id: 'a', status: 'CHECKED_IN' }),
      appt({ id: 'b', status: 'COMPLETED' }),
      appt({ id: 'c', status: 'CANCELLED' }),
    ];
    expect(pickEligibleAppointment(candidates, NOW)).toBeNull();
  });

  it('múltiplos candidatos: escolhe o com startsAt mais próximo de now', () => {
    const candidates = [
      appt({ id: 'far', startsAt: new Date('2026-05-19T13:40:00Z') }),
      appt({ id: 'closer', startsAt: new Date('2026-05-19T13:55:00Z') }),
      appt({ id: 'closest', startsAt: new Date('2026-05-19T14:05:00Z') }),
    ];
    // far=20min antes, closer=5min antes, closest=5min depois → empate entre closer e closest
    // Stable: o primeiro do sort vence (closer aparece antes no array de input após sort)
    expect(['closer', 'closest']).toContain(pickEligibleAppointment(candidates, NOW)?.id);
  });

  it('lista vazia → null', () => {
    expect(pickEligibleAppointment([], NOW)).toBeNull();
  });
});
