'use client';

import { useEffect, useState } from 'react';
import type { BusinessHoursResponse } from '@rpx/shared';
import { ApiError, api } from '@/lib/api';
import { SearchableSelect } from './SearchableSelect';

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const;

/**
 * Editor da grade de funcionamento de um serviço. Lista as janelas existentes
 * agrupadas por dia da semana e permite adicionar/remover.
 */
export function BusinessHoursEditor({ serviceId }: { serviceId: string }) {
  const [hours, setHours] = useState<BusinessHoursResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // form de adição
  const [weekday, setWeekday] = useState(1);
  const [opensAt, setOpensAt] = useState('08:00');
  const [closesAt, setClosesAt] = useState('18:00');
  const [busy, setBusy] = useState(false);

  function load() {
    api<BusinessHoursResponse[]>(`/services/${serviceId}/business-hours`)
      .then(setHours)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Falha ao carregar horários.'),
      );
  }

  useEffect(load, [serviceId]);

  async function handleAdd() {
    setBusy(true);
    setError(null);
    try {
      await api(`/services/${serviceId}/business-hours`, {
        method: 'POST',
        body: { weekday, opensAt, closesAt },
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao adicionar horário.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id: string) {
    setError(null);
    try {
      await api(`/business-hours/${id}`, { method: 'DELETE' });
      setHours((prev) => prev?.filter((h) => h.id !== id) ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao remover horário.');
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      {!hours ? (
        <div className="text-neutral-400 text-sm">Carregando…</div>
      ) : hours.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Nenhuma janela cadastrada — o serviço não gera slots em nenhum dia.
        </p>
      ) : (
        <div className="space-y-1">
          {WEEKDAYS.map((label, wd) => {
            const dayHours = hours
              .filter((h) => h.weekday === wd)
              .sort((a, b) => a.opensAt.localeCompare(b.opensAt));
            if (dayHours.length === 0) return null;
            return (
              <div key={wd} className="flex items-center gap-3 text-sm">
                <span className="w-20 font-medium text-neutral-700">{label}</span>
                <div className="flex flex-wrap gap-2">
                  {dayHours.map((h) => (
                    <span
                      key={h.id}
                      className="inline-flex items-center gap-2 bg-brand-cyanLight text-brand-cyanDark rounded px-2 py-0.5"
                    >
                      {h.opensAt}–{h.closesAt}
                      <button
                        onClick={() => handleRemove(h.id)}
                        className="text-brand-cyanDark hover:text-red-600 font-bold"
                        title="Remover"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-end gap-2 pt-2 border-t border-neutral-100">
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">Dia</label>
          <SearchableSelect
            value={String(weekday)}
            onChange={(v) => setWeekday(Number(v))}
            options={WEEKDAYS.map((label, wd) => ({ value: String(wd), label }))}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">Abre</label>
          <input
            type="time"
            value={opensAt}
            onChange={(e) => setOpensAt(e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">Fecha</label>
          <input
            type="time"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
            className="input"
          />
        </div>
        <button onClick={handleAdd} disabled={busy} className="btn-primary">
          {busy ? 'Adicionando…' : 'Adicionar janela'}
        </button>
      </div>
    </div>
  );
}
