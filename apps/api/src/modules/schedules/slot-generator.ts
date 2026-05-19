import { addMinutes } from 'date-fns';
import { fromZonedTime, toZonedTime, format as formatTz } from 'date-fns-tz';
import type { Slot } from '@rpx/shared';

export interface DayWindow {
  /** HH:MM no fuso da unidade. */
  opensAt: string;
  /** HH:MM no fuso da unidade. */
  closesAt: string;
}

export interface GenerateSlotsInput {
  /** Data desejada (qualquer instante do dia). */
  date: Date;
  /** Timezone IANA da unidade (ex: "America/Sao_Paulo"). */
  timezone: string;
  /** Duração de cada slot em minutos. */
  serviceDurationMinutes: number;
  /** Antecedência mínima (em minutos) para o início do slot vs agora. */
  schedulingLeadMinutes: number;
  /** Janelas de funcionamento do dia (zero, uma ou várias). */
  windows: DayWindow[];
  /** Momento atual (default: now). Útil em testes. */
  now?: Date;
}

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function assertHHMM(value: string, field: string): void {
  if (!HHMM_RE.test(value)) {
    throw new Error(`[slot-generator] ${field} inválido: "${value}" (esperado HH:MM)`);
  }
}

/**
 * Combina uma data (instante qualquer do dia, no calendário do timezone) com
 * uma string HH:MM (no mesmo timezone) e devolve o instante UTC correspondente.
 */
function combineDateAndLocalTime(date: Date, hhmm: string, timezone: string): Date {
  assertHHMM(hhmm, 'time-of-day');
  // Pega o YYYY-MM-DD do dia da data no timezone alvo.
  const ymd = formatTz(toZonedTime(date, timezone), 'yyyy-MM-dd', { timeZone: timezone });
  return fromZonedTime(`${ymd}T${hhmm}:00`, timezone);
}

/**
 * Gera os slots disponíveis para um serviço em um dia, no fuso da unidade.
 *
 * Regras:
 * - Janela do dia vem de `windows` (várias, p/ ex manhã+tarde).
 * - Cada slot tem duração `serviceDurationMinutes`.
 * - O último slot termina exatamente em (ou antes de) `closesAt` — não é gerado
 *   slot que ultrapasse o fechamento.
 * - Slots cujo início é anterior a `now + schedulingLeadMinutes` são filtrados.
 * - Resultado em ordem cronológica.
 *
 * O caller é responsável por filtrar slots já lotados (capacidade do serviço ou
 * conflito de equipamento) — esta função só cuida do "esqueleto temporal".
 */
export function generateSlots(input: GenerateSlotsInput): Slot[] {
  const {
    date,
    timezone,
    serviceDurationMinutes,
    schedulingLeadMinutes,
    windows,
    now = new Date(),
  } = input;

  if (serviceDurationMinutes <= 0) {
    throw new Error('[slot-generator] serviceDurationMinutes deve ser > 0');
  }

  const leadCutoff = addMinutes(now, schedulingLeadMinutes);
  const slots: Slot[] = [];

  for (const w of windows) {
    assertHHMM(w.opensAt, 'opensAt');
    assertHHMM(w.closesAt, 'closesAt');
    if (w.opensAt >= w.closesAt) continue;

    const windowStart = combineDateAndLocalTime(date, w.opensAt, timezone);
    const windowEnd = combineDateAndLocalTime(date, w.closesAt, timezone);

    let cursor = windowStart;
    while (true) {
      const slotEnd = addMinutes(cursor, serviceDurationMinutes);
      if (slotEnd.getTime() > windowEnd.getTime()) break;

      if (cursor.getTime() >= leadCutoff.getTime()) {
        slots.push({
          startsAt: cursor,
          endsAt: slotEnd,
          localStart: formatTz(toZonedTime(cursor, timezone), 'HH:mm', { timeZone: timezone }),
          localEnd: formatTz(toZonedTime(slotEnd, timezone), 'HH:mm', { timeZone: timezone }),
        });
      }
      cursor = slotEnd;
    }
  }

  return slots;
}

/**
 * Calcula o início (instante UTC) da semana corrente para um dado momento,
 * considerando o fuso da unidade e que a semana começa na segunda-feira 00:00.
 * Reset semanal de quota de SUBSCRIPTION usa essa função.
 */
export function startOfWeekMonday(at: Date, timezone: string): Date {
  const local = toZonedTime(at, timezone);
  const dow = local.getDay(); // 0=domingo, 1=segunda, ...
  const daysToSubtract = dow === 0 ? 6 : dow - 1;
  local.setDate(local.getDate() - daysToSubtract);
  local.setHours(0, 0, 0, 0);
  const ymd = formatTz(local, 'yyyy-MM-dd', { timeZone: timezone });
  return fromZonedTime(`${ymd}T00:00:00`, timezone);
}
