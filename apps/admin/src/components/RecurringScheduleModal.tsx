'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PlanResponse, RecurringAppointmentsResponse } from '@rpx/shared';
import { ApiError, api } from '@/lib/api';
import { Modal } from './Modal';

const WEEKDAYS = [
  { n: 1, label: 'Segunda' },
  { n: 2, label: 'Terça' },
  { n: 3, label: 'Quarta' },
  { n: 4, label: 'Quinta' },
  { n: 5, label: 'Sexta' },
  { n: 6, label: 'Sábado' },
  { n: 0, label: 'Domingo' },
];

/**
 * Agenda os dias fixos de um paciente em um plano (recorrente).
 * PACKAGE: gera até esgotar as sessões; SUBSCRIPTION: até a data fim.
 * Conflitos são pulados e reportados.
 */
export function RecurringScheduleModal({
  open,
  onClose,
  plan,
  serviceName,
  patientId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  plan: PlanResponse | null;
  serviceName: string;
  patientId: string;
  onDone: () => void;
}) {
  const tomorrow = useMemo(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), []);
  const [times, setTimes] = useState<Record<number, string>>({});
  const [startDate, setStartDate] = useState(tomorrow);
  const [endDate, setEndDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecurringAppointmentsResponse | null>(null);

  const isSubscription = plan?.type === 'SUBSCRIPTION';

  useEffect(() => {
    if (open) {
      setTimes({});
      setStartDate(tomorrow);
      setEndDate(plan?.endsAt ? new Date(plan.endsAt).toISOString().slice(0, 10) : '');
      setError(null);
      setResult(null);
    }
  }, [open, plan, tomorrow]);

  function toggleDay(n: number) {
    setTimes((prev) => {
      const next = { ...prev };
      if (n in next) delete next[n];
      else next[n] = '08:00';
      return next;
    });
  }

  const selectedCount = Object.keys(times).length;
  const canSubmit =
    !!plan &&
    !busy &&
    selectedCount > 0 &&
    !!startDate &&
    (!isSubscription || !!endDate || !!plan?.endsAt);

  async function submit() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const slots = Object.entries(times).map(([wd, time]) => ({ weekday: Number(wd), time }));
      const body: Record<string, unknown> = {
        patientId,
        planId: plan.id,
        startDate,
        slots,
      };
      if (isSubscription && endDate) body.endDate = endDate;
      const res = await api<RecurringAppointmentsResponse>('/appointments/recurring', {
        method: 'POST',
        body,
      });
      setResult(res);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao agendar recorrência.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Agendar recorrente">
      {!plan ? null : result ? (
        <div className="space-y-3">
          <div className="rounded bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
            <strong>{result.created.length}</strong> agendamento(s) criados
            {result.skipped.length > 0 && (
              <>
                {' '}
                · <strong>{result.skipped.length}</strong> pulado(s)
              </>
            )}
            .
          </div>
          {result.skipped.length > 0 && (
            <div>
              <div className="mb-1 text-sm font-medium text-neutral-700">Pulados:</div>
              <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-neutral-600">
                {result.skipped.map((s, i) => (
                  <li
                    key={i}
                    className="flex justify-between gap-2 border-b border-neutral-100 pb-1"
                  >
                    <span className="font-mono">{formatDateTime(s.startsAt)}</span>
                    <span className="text-right text-amber-700">{s.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-end pt-1">
            <button onClick={onClose} className="btn-primary">
              Fechar
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            <strong>{serviceName}</strong> ·{' '}
            {plan.type === 'PACKAGE'
              ? `${plan.remainingSessions ?? 0} sessões restantes`
              : `assinatura ${plan.weeklyQuota ?? '—'}x/semana`}
          </p>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Dias e horários
            </label>
            <div className="space-y-1.5">
              {WEEKDAYS.map(({ n, label }) => {
                const on = n in times;
                return (
                  <div key={n} className="flex items-center gap-3">
                    <label className="flex w-28 items-center gap-2 text-sm">
                      <input type="checkbox" checked={on} onChange={() => toggleDay(n)} />
                      {label}
                    </label>
                    {on && (
                      <input
                        type="time"
                        value={times[n]}
                        onChange={(e) => setTimes((p) => ({ ...p, [n]: e.target.value }))}
                        className="rounded border border-neutral-300 px-2 py-1 text-sm"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Início *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input"
              />
            </div>
            {isSubscription && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Fim *</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="input"
                />
              </div>
            )}
          </div>

          <p className="text-xs text-neutral-500">
            {plan.type === 'PACKAGE'
              ? 'Gera nas datas escolhidas até esgotar as sessões (respeita a validade). Horários lotados/conflitantes são pulados e listados.'
              : 'Gera nas datas escolhidas até o fim. Respeita a quota semanal; conflitos são pulados e listados.'}
          </p>

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="btn-outline">
              Cancelar
            </button>
            <button onClick={submit} disabled={!canSubmit} className="btn-primary">
              {busy ? 'Agendando…' : 'Agendar'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function formatDateTime(d: Date | string): string {
  return new Date(d).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
