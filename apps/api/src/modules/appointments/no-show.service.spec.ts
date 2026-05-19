import { filterNoShowCandidates, type NoShowCandidate } from './no-show.service';

const NOW = new Date('2026-05-19T15:00:00Z');

function candidate(id: string, endsAt: string, grace = 15): NoShowCandidate {
  return { id, endsAt: new Date(endsAt), service: { noShowGraceMinutes: grace } };
}

describe('filterNoShowCandidates', () => {
  it('marca apenas appointments cujo (endsAt + grace) já passou de now', () => {
    const rows = [
      // 14:40 + 15min = 14:55 < 15:00 → MARCA
      candidate('a', '2026-05-19T14:40:00Z'),
      // 14:50 + 15min = 15:05 > 15:00 → não marca (ainda dentro da grace)
      candidate('b', '2026-05-19T14:50:00Z'),
      // 14:30 + 15min = 14:45 < 15:00 → MARCA
      candidate('c', '2026-05-19T14:30:00Z'),
      // 15:30 (futuro) → não marca
      candidate('d', '2026-05-19T15:30:00Z'),
    ];
    expect(filterNoShowCandidates(rows, NOW).map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('respeita grace por serviço (não fixo)', () => {
    // appointment c/ endsAt 14:45 e grace de 60 → 15:45 > 15:00 → não marca
    const rows = [candidate('long-grace', '2026-05-19T14:45:00Z', 60)];
    expect(filterNoShowCandidates(rows, NOW)).toEqual([]);
  });

  it('grace=0 marca tudo que terminou antes do agora', () => {
    const rows = [candidate('a', '2026-05-19T14:59:00Z', 0)];
    expect(filterNoShowCandidates(rows, NOW)).toHaveLength(1);
  });

  it('lista vazia entra/sai vazia', () => {
    expect(filterNoShowCandidates([], NOW)).toEqual([]);
  });
});
