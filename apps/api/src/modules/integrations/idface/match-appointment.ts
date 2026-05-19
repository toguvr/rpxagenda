/**
 * Função pura que escolhe o appointment elegível para um check-in iDFace.
 * Sem depender de Prisma — recebe os candidatos já filtrados por paciente +
 * status válido + janela bruta no banco e devolve o melhor (ou null).
 */
export interface MatchableAppointment {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: 'SCHEDULED' | 'CONFIRMED' | 'CHECKED_IN' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  service: {
    checkInWindowBeforeMin: number;
    checkInWindowAfterMin: number;
  };
}

/**
 * Janela aceitável para check-in:
 *   [startsAt - checkInWindowBeforeMin, startsAt + checkInWindowAfterMin]
 *
 * Estados aceitáveis (incluindo NO_SHOW para permitir reversão por chegada tardia
 * quando a janela após o startsAt ainda estiver aberta — configurável por serviço):
 *   SCHEDULED | CONFIRMED | NO_SHOW
 *
 * Em caso de múltiplos candidatos válidos, escolhe o com `startsAt` mais próximo
 * de `now` (em valor absoluto).
 */
export function pickEligibleAppointment<T extends MatchableAppointment>(
  candidates: T[],
  now: Date,
): T | null {
  const valid = candidates.filter((appt) => {
    if (!['SCHEDULED', 'CONFIRMED', 'NO_SHOW'].includes(appt.status)) return false;
    const beforeMs = appt.service.checkInWindowBeforeMin * 60 * 1000;
    const afterMs = appt.service.checkInWindowAfterMin * 60 * 1000;
    const windowStart = appt.startsAt.getTime() - beforeMs;
    const windowEnd = appt.startsAt.getTime() + afterMs;
    return now.getTime() >= windowStart && now.getTime() <= windowEnd;
  });
  if (valid.length === 0) return null;
  valid.sort(
    (a, b) =>
      Math.abs(a.startsAt.getTime() - now.getTime()) -
      Math.abs(b.startsAt.getTime() - now.getTime()),
  );
  return valid[0]!;
}
