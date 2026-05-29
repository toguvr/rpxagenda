'use client';

import { useEffect, useMemo, useState } from 'react';
import type { EquipmentResponse } from '@rpx/shared';
import { ApiError, api } from '@/lib/api';

/**
 * Vincula equipamentos a um serviço (tabela ServiceEquipment). Esses são os
 * equipamentos que o serviço *pode* exigir; a avaliação (protocolo) marca quais
 * o paciente realmente precisa, e a capacidade do equipamento (§4.3) limita as
 * vagas no horário. Persiste via PUT /services/:id/equipments (substitui o conjunto).
 */
export function ServiceEquipmentsEditor({ serviceId }: { serviceId: string }) {
  const [allEquipments, setAllEquipments] = useState<EquipmentResponse[] | null>(null);
  const [initial, setInitial] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [all, linked] = await Promise.all([
          api<EquipmentResponse[]>('/equipments'),
          api<EquipmentResponse[]>(`/services/${serviceId}/equipments`),
        ]);
        setAllEquipments(all);
        const ids = new Set(linked.map((e) => e.id));
        setInitial(ids);
        setSelected(new Set(ids));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Falha ao carregar equipamentos.');
      }
    })();
  }, [serviceId]);

  const dirty = useMemo(() => {
    if (selected.size !== initial.size) return true;
    for (const id of selected) if (!initial.has(id)) return true;
    return false;
  }, [selected, initial]);

  function toggle(id: string) {
    setMsg(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await api(`/services/${serviceId}/equipments`, {
        method: 'PUT',
        body: { equipmentIds: Array.from(selected) },
      });
      setInitial(new Set(selected));
      setMsg('Salvo.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar equipamentos.');
    } finally {
      setBusy(false);
    }
  }

  if (error && !allEquipments) {
    return (
      <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
        {error}
      </div>
    );
  }
  if (!allEquipments) return <div className="text-neutral-400 text-sm">Carregando…</div>;

  const active = allEquipments.filter((e) => e.active);

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500">
        Equipamentos que este serviço pode usar. O número entre parênteses é o estoque — quando ele
        esgota num horário, novos agendamentos que precisem dele são bloqueados.
      </p>

      {active.length === 0 ? (
        <p className="text-sm text-neutral-400">
          Nenhum equipamento cadastrado. Crie em “Equipamentos” primeiro.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {active.map((e) => {
            const on = selected.has(e.id);
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => toggle(e.id)}
                className={
                  'rounded-full border px-3 py-1.5 text-sm transition-colors ' +
                  (on
                    ? 'border-brand-cyan bg-brand-cyanLight text-brand-cyanDark'
                    : 'border-neutral-300 text-neutral-600 hover:border-brand-cyan')
                }
              >
                {e.name} ({e.totalQuantity})
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy || !dirty} className="btn-primary">
          {busy ? 'Salvando…' : 'Salvar equipamentos'}
        </button>
        {msg && <span className="text-sm text-neutral-500">{msg}</span>}
      </div>
    </div>
  );
}
