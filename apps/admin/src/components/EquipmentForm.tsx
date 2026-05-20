'use client';

import { useState, FormEvent } from 'react';
import type { EquipmentResponse } from '@rpx/shared';

export interface EquipmentFormValues {
  name: string;
  totalQuantity: number;
  active: boolean;
}

export function EquipmentForm({
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: EquipmentResponse;
  submitLabel: string;
  busy: boolean;
  onSubmit: (values: EquipmentFormValues) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [totalQuantity, setTotalQuantity] = useState(initial?.totalQuantity ?? 1);
  const [active, setActive] = useState(initial?.active ?? true);

  function handle(e: FormEvent) {
    e.preventDefault();
    onSubmit({ name, totalQuantity, active });
  }

  return (
    <form onSubmit={handle} className="space-y-4 max-w-md">
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">Nome *</label>
        <input
          type="text"
          required
          minLength={2}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Quantidade total *
        </label>
        <input
          type="number"
          min={1}
          required
          value={totalQuantity}
          onChange={(e) => setTotalQuantity(Number(e.target.value))}
          className="input"
        />
        <p className="text-xs text-neutral-500 mt-1">
          Quantos existem fisicamente — limita agendamentos simultâneos.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          id="active"
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="w-4 h-4 accent-brand-cyan"
        />
        <label htmlFor="active" className="text-sm font-medium text-neutral-700">
          Equipamento ativo
        </label>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="btn-outline">
          Cancelar
        </button>
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? 'Salvando…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
