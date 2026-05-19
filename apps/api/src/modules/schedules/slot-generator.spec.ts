import { generateSlots, startOfWeekMonday } from './slot-generator';

const TZ = 'America/Sao_Paulo';

describe('generateSlots', () => {
  it('gera slots de 50min em janela única (08:00–12:00) → 4 slots', () => {
    const slots = generateSlots({
      date: new Date('2026-05-19T12:00:00Z'),
      timezone: TZ,
      serviceDurationMinutes: 50,
      schedulingLeadMinutes: 0,
      windows: [{ opensAt: '08:00', closesAt: '12:00' }],
      now: new Date('2026-05-18T00:00:00Z'),
    });
    expect(slots.map((s) => s.localStart)).toEqual(['08:00', '08:50', '09:40', '10:30']);
    // o slot 11:20–12:10 não cabe (estoura 12:00)
    expect(slots.map((s) => s.localEnd)).toEqual(['08:50', '09:40', '10:30', '11:20']);
  });

  it('respeita múltiplas janelas (manhã + tarde com hiato no almoço)', () => {
    const slots = generateSlots({
      date: new Date('2026-05-19T12:00:00Z'),
      timezone: TZ,
      serviceDurationMinutes: 60,
      schedulingLeadMinutes: 0,
      windows: [
        { opensAt: '08:00', closesAt: '12:00' },
        { opensAt: '14:00', closesAt: '18:00' },
      ],
      now: new Date('2026-05-18T00:00:00Z'),
    });
    // 4 da manhã + 4 da tarde
    expect(slots).toHaveLength(8);
    expect(slots.map((s) => s.localStart)).toEqual([
      '08:00',
      '09:00',
      '10:00',
      '11:00',
      '14:00',
      '15:00',
      '16:00',
      '17:00',
    ]);
  });

  it('filtra slots dentro da janela de antecedência mínima', () => {
    // now = 19/05 às 10:00 BRT; lead = 60 min → corte às 11:00.
    // Slots de 60min na janela 08:00-13:00 são 08, 09, 10, 11, 12.
    // Devem sobrar: 11:00 e 12:00.
    const slots = generateSlots({
      date: new Date('2026-05-19T12:00:00Z'),
      timezone: TZ,
      serviceDurationMinutes: 60,
      schedulingLeadMinutes: 60,
      windows: [{ opensAt: '08:00', closesAt: '13:00' }],
      now: new Date('2026-05-19T13:00:00Z'), // 10:00 BRT
    });
    expect(slots.map((s) => s.localStart)).toEqual(['11:00', '12:00']);
  });

  it('janelas vazias → sem slots', () => {
    const slots = generateSlots({
      date: new Date('2026-05-19T12:00:00Z'),
      timezone: TZ,
      serviceDurationMinutes: 50,
      schedulingLeadMinutes: 0,
      windows: [],
      now: new Date('2026-05-18T00:00:00Z'),
    });
    expect(slots).toEqual([]);
  });

  it('janela com opensAt >= closesAt é ignorada (não gera nada)', () => {
    const slots = generateSlots({
      date: new Date('2026-05-19T12:00:00Z'),
      timezone: TZ,
      serviceDurationMinutes: 50,
      schedulingLeadMinutes: 0,
      windows: [{ opensAt: '18:00', closesAt: '12:00' }],
      now: new Date('2026-05-18T00:00:00Z'),
    });
    expect(slots).toEqual([]);
  });

  it('rejeita durationMinutes <= 0', () => {
    expect(() =>
      generateSlots({
        date: new Date(),
        timezone: TZ,
        serviceDurationMinutes: 0,
        schedulingLeadMinutes: 0,
        windows: [{ opensAt: '08:00', closesAt: '12:00' }],
      }),
    ).toThrow();
  });

  it('startsAt e endsAt batem com o fuso América/SP (UTC-3 sem DST atual)', () => {
    const slots = generateSlots({
      // Meio-dia UTC do dia 19 = 09:00 BRT do dia 19 (sem ambiguidade de date-line).
      date: new Date('2026-05-19T12:00:00Z'),
      timezone: TZ,
      serviceDurationMinutes: 60,
      schedulingLeadMinutes: 0,
      windows: [{ opensAt: '08:00', closesAt: '09:00' }],
      now: new Date('2026-05-18T00:00:00Z'),
    });
    expect(slots).toHaveLength(1);
    // 08:00 BRT (-03:00) = 11:00 UTC
    expect(slots[0]!.startsAt.toISOString()).toBe('2026-05-19T11:00:00.000Z');
    expect(slots[0]!.endsAt.toISOString()).toBe('2026-05-19T12:00:00.000Z');
  });
});

describe('startOfWeekMonday', () => {
  it('uma terça às 14h BRT → segunda 00:00 BRT', () => {
    // 2026-05-19 (terça) 14:30 BRT = 17:30 UTC
    const at = new Date('2026-05-19T17:30:00Z');
    const monday = startOfWeekMonday(at, TZ);
    // 2026-05-18 00:00 BRT = 2026-05-18 03:00 UTC
    expect(monday.toISOString()).toBe('2026-05-18T03:00:00.000Z');
  });

  it('um domingo 23:59 BRT → segunda anterior 00:00 BRT', () => {
    // 2026-05-24 (domingo) 23:59 BRT = 2026-05-25 02:59 UTC
    const at = new Date('2026-05-25T02:59:00Z');
    const monday = startOfWeekMonday(at, TZ);
    // segunda 2026-05-18 00:00 BRT
    expect(monday.toISOString()).toBe('2026-05-18T03:00:00.000Z');
  });

  it('uma segunda 00:00 BRT é o próprio início da semana', () => {
    const at = new Date('2026-05-18T03:00:00Z'); // 00:00 BRT
    const monday = startOfWeekMonday(at, TZ);
    expect(monday.toISOString()).toBe('2026-05-18T03:00:00.000Z');
  });
});
