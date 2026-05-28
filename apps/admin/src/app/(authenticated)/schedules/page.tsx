'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScheduleExceptionType,
  UserRole,
  type BusinessHoursResponse,
  type ScheduleExceptionResponse,
  type ServiceResponse,
} from '@rpx/shared';
import { ApiError, api } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { Card } from '@/components/Card';
import { Modal } from '@/components/Modal';

// Ordem de exibição: semana de trabalho primeiro. weekday: 0=Dom .. 6=Sáb.
const WEEKDAYS = [
  { n: 1, label: 'Segunda' },
  { n: 2, label: 'Terça' },
  { n: 3, label: 'Quarta' },
  { n: 4, label: 'Quinta' },
  { n: 5, label: 'Sexta' },
  { n: 6, label: 'Sábado' },
  { n: 0, label: 'Domingo' },
];

export default function SchedulesPage() {
  const [services, setServices] = useState<ServiceResponse[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [hours, setHours] = useState<BusinessHoursResponse[] | null>(null);
  const [exceptions, setExceptions] = useState<ScheduleExceptionResponse[] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoursError, setHoursError] = useState<string | null>(null);

  // rascunho de "adicionar janela" por dia da semana
  const [draft, setDraft] = useState<Record<number, { open: string; close: string }>>({});
  const [busy, setBusy] = useState(false);

  // modal de exceção
  const [excOpen, setExcOpen] = useState(false);

  useEffect(() => {
    setIsAdmin(getCurrentUser()?.role === UserRole.ADMIN);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [svcs, excs] = await Promise.all([
          api<ServiceResponse[]>('/services?includeInactive=true'),
          api<ScheduleExceptionResponse[]>('/schedules/exceptions'),
        ]);
        setServices(svcs);
        setExceptions(excs);
        const firstActive = svcs.find((s) => s.active) ?? svcs[0];
        if (firstActive) setServiceId(firstActive.id);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Falha ao carregar dados.');
      }
    })();
  }, []);

  const loadHours = useCallback(async () => {
    if (!serviceId) return;
    setHours(null);
    setHoursError(null);
    try {
      const list = await api<BusinessHoursResponse[]>(`/services/${serviceId}/business-hours`);
      setHours(list);
    } catch (err) {
      setHoursError(err instanceof ApiError ? err.message : 'Falha ao carregar horários.');
    }
  }, [serviceId]);

  useEffect(() => {
    loadHours();
  }, [loadHours]);

  const reloadExceptions = useCallback(async () => {
    try {
      setExceptions(await api<ScheduleExceptionResponse[]>('/schedules/exceptions'));
    } catch {
      /* mantém a lista atual */
    }
  }, []);

  const hoursByWeekday = useMemo(() => {
    const m = new Map<number, BusinessHoursResponse[]>();
    for (const h of hours ?? []) {
      const arr = m.get(h.weekday) ?? [];
      arr.push(h);
      m.set(h.weekday, arr);
    }
    return m;
  }, [hours]);

  const serviceName = useCallback(
    (id: string | null) =>
      id ? (services.find((s) => s.id === id)?.name ?? id.slice(0, 8)) : null,
    [services],
  );

  async function addWindow(weekday: number) {
    const d = draft[weekday];
    if (!d?.open || !d?.close) return;
    if (d.open >= d.close) {
      setHoursError('O fechamento deve ser maior que a abertura.');
      return;
    }
    setBusy(true);
    setHoursError(null);
    try {
      await api(`/services/${serviceId}/business-hours`, {
        method: 'POST',
        body: { weekday, opensAt: d.open, closesAt: d.close },
      });
      setDraft((prev) => ({ ...prev, [weekday]: { open: '', close: '' } }));
      await loadHours();
    } catch (err) {
      setHoursError(err instanceof ApiError ? err.message : 'Falha ao adicionar janela.');
    } finally {
      setBusy(false);
    }
  }

  async function removeWindow(id: string) {
    setBusy(true);
    setHoursError(null);
    try {
      await api(`/business-hours/${id}`, { method: 'DELETE' });
      await loadHours();
    } catch (err) {
      setHoursError(err instanceof ApiError ? err.message : 'Falha ao remover janela.');
    } finally {
      setBusy(false);
    }
  }

  async function removeException(id: string) {
    try {
      await api(`/schedules/exceptions/${id}`, { method: 'DELETE' });
      await reloadExceptions();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao remover exceção.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold text-brand-black">Horários</h1>
          <p className="text-sm text-neutral-500">
            Funcionamento semanal por serviço e dias fechados/excepcionais
          </p>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      {/* ---- Funcionamento semanal ---- */}
      <Card title="Funcionamento semanal">
        <div className="mb-4 max-w-sm">
          <label className="block text-sm font-medium text-neutral-700 mb-1">Serviço</label>
          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="input"
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.durationMinutes} min){s.active ? '' : ' — inativo'}
              </option>
            ))}
          </select>
        </div>

        {hoursError && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">
            {hoursError}
          </div>
        )}

        {!hours ? (
          <div className="text-neutral-400">Carregando…</div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {WEEKDAYS.map(({ n, label }) => {
              const windows = (hoursByWeekday.get(n) ?? [])
                .slice()
                .sort((a, b) => a.opensAt.localeCompare(b.opensAt));
              const d = draft[n] ?? { open: '', close: '' };
              return (
                <div key={n} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                  <div className="w-24 shrink-0 text-sm font-medium text-brand-black">{label}</div>
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    {windows.length === 0 && (
                      <span className="text-sm text-neutral-400">Fechado</span>
                    )}
                    {windows.map((w) => (
                      <span
                        key={w.id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-brand-cyanLight px-2.5 py-1 text-xs font-medium text-brand-cyanDark"
                      >
                        {w.opensAt}–{w.closesAt}
                        {isAdmin && (
                          <button
                            onClick={() => removeWindow(w.id)}
                            disabled={busy}
                            className="text-brand-cyanDark/70 hover:text-red-600"
                            title="Remover janela"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                    {isAdmin && (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="time"
                          value={d.open}
                          onChange={(e) =>
                            setDraft((p) => ({ ...p, [n]: { ...d, open: e.target.value } }))
                          }
                          className="rounded border border-neutral-300 px-2 py-1 text-sm"
                        />
                        <span className="text-neutral-400">–</span>
                        <input
                          type="time"
                          value={d.close}
                          onChange={(e) =>
                            setDraft((p) => ({ ...p, [n]: { ...d, close: e.target.value } }))
                          }
                          className="rounded border border-neutral-300 px-2 py-1 text-sm"
                        />
                        <button
                          onClick={() => addWindow(n)}
                          disabled={busy || !d.open || !d.close}
                          className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium text-brand-black transition-colors hover:border-brand-cyan hover:text-brand-cyanDark disabled:opacity-50"
                        >
                          + adicionar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ---- Exceções / dias fechados ---- */}
      <Card title="Dias fechados e exceções">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-neutral-500">
            Desabilite um dia específico — da unidade inteira ou de um serviço só.
          </p>
          {isAdmin && (
            <button
              onClick={() => setExcOpen(true)}
              className="text-sm font-medium text-brand-cyanDark hover:underline whitespace-nowrap"
            >
              + Desabilitar um dia
            </button>
          )}
        </div>

        {!exceptions ? (
          <div className="text-neutral-400">Carregando…</div>
        ) : exceptions.length === 0 ? (
          <p className="text-sm text-neutral-400">Nenhuma exceção cadastrada.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {exceptions.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-brand-black">{formatDate(e.date)}</span>
                    <span
                      className={
                        'rounded-full px-2 py-0.5 text-xs font-medium ' +
                        (e.type === 'CLOSED'
                          ? 'bg-red-50 text-red-700'
                          : 'bg-amber-50 text-amber-700')
                      }
                    >
                      {e.type === 'CLOSED' ? 'Fechado' : `Especial ${e.opensAt}–${e.closesAt}`}
                    </span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                      {e.serviceId ? (serviceName(e.serviceId) ?? 'Serviço') : 'Unidade inteira'}
                    </span>
                  </div>
                  {e.reason && <div className="mt-0.5 text-xs text-neutral-500">{e.reason}</div>}
                </div>
                {isAdmin && (
                  <button
                    onClick={() => removeException(e.id)}
                    className="shrink-0 text-xs font-medium text-red-700 hover:underline"
                  >
                    Remover
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ExceptionModal
        open={excOpen}
        onClose={() => setExcOpen(false)}
        services={services}
        defaultServiceId={serviceId}
        onCreated={() => {
          setExcOpen(false);
          reloadExceptions();
        }}
      />
    </div>
  );
}

function ExceptionModal({
  open,
  onClose,
  services,
  defaultServiceId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  services: ServiceResponse[];
  defaultServiceId: string;
  onCreated: () => void;
}) {
  // scope: '' = unidade inteira; senão = serviceId
  const [scope, setScope] = useState('');
  const [date, setDate] = useState('');
  const [type, setType] = useState<ScheduleExceptionType>(ScheduleExceptionType.CLOSED);
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setScope(defaultServiceId || '');
  }, [open, defaultServiceId]);

  async function submit() {
    if (!date) return;
    if (type === 'CUSTOM' && (!opensAt || !closesAt)) {
      setError('Horário especial exige abertura e fechamento.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { date, type };
      if (scope) body.serviceId = scope;
      if (type === 'CUSTOM') {
        body.opensAt = opensAt;
        body.closesAt = closesAt;
      }
      if (reason.trim()) body.reason = reason.trim();
      await api('/schedules/exceptions', { method: 'POST', body });
      resetAndClose();
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar exceção.');
    } finally {
      setBusy(false);
    }
  }

  function resetAndClose() {
    setDate('');
    setType(ScheduleExceptionType.CLOSED);
    setOpensAt('');
    setClosesAt('');
    setReason('');
    setError(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={resetAndClose} title="Desabilitar / exceção de um dia">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Data *</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Aplica-se a</label>
          <select value={scope} onChange={(e) => setScope(e.target.value)} className="input">
            <option value="">Unidade inteira</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                Só: {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Tipo</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ScheduleExceptionType)}
            className="input"
          >
            <option value="CLOSED">Fechado (sem atendimento)</option>
            <option value="CUSTOM">Horário especial</option>
          </select>
        </div>
        {type === 'CUSTOM' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Abre *</label>
              <input
                type="time"
                value={opensAt}
                onChange={(e) => setOpensAt(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Fecha *</label>
              <input
                type="time"
                value={closesAt}
                onChange={(e) => setClosesAt(e.target.value)}
                className="input"
              />
            </div>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Motivo (opcional)
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            placeholder="Feriado, manutenção, folga…"
            className="input"
          />
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={resetAndClose} className="btn-outline">
            Cancelar
          </button>
          <button onClick={submit} disabled={busy || !date} className="btn-primary">
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function formatDate(d: Date | string): string {
  // Exceção é uma data-only (UTC meia-noite); formata em UTC para não deslizar um dia.
  return new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}
