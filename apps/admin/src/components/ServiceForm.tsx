'use client';

import { useState, FormEvent } from 'react';
import type { ServiceResponse } from '@rpx/shared';

export interface ServiceFormValues {
  name: string;
  type: string;
  durationMinutes: number;
  slotCapacity: number;
  cancellationLeadMinutes: number;
  schedulingLeadMinutes: number;
  checkInWindowBeforeMin: number;
  checkInWindowAfterMin: number;
  noShowGraceMinutes: number;
  acceptedPlanType: string;
  active: boolean;
}

const SERVICE_TYPES = ['FISIO', 'MUSCULACAO', 'RPG', 'PILATES', 'AVALIACAO'] as const;
const PLAN_TYPES = ['PACKAGE', 'SUBSCRIPTION'] as const;

function fromService(s?: ServiceResponse): ServiceFormValues {
  return {
    name: s?.name ?? '',
    type: s?.type ?? 'FISIO',
    durationMinutes: s?.durationMinutes ?? 50,
    slotCapacity: s?.slotCapacity ?? 1,
    cancellationLeadMinutes: s?.cancellationLeadMinutes ?? 240,
    schedulingLeadMinutes: s?.schedulingLeadMinutes ?? 60,
    checkInWindowBeforeMin: s?.checkInWindowBeforeMin ?? 30,
    checkInWindowAfterMin: s?.checkInWindowAfterMin ?? 15,
    noShowGraceMinutes: s?.noShowGraceMinutes ?? 15,
    acceptedPlanType: s?.acceptedPlanType ?? 'PACKAGE',
    active: s?.active ?? true,
  };
}

export function ServiceForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  busy,
}: {
  initial?: ServiceResponse;
  submitLabel: string;
  onSubmit: (values: ServiceFormValues) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [v, setV] = useState<ServiceFormValues>(fromService(initial));

  function num(key: keyof ServiceFormValues) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setV((prev) => ({ ...prev, [key]: Number(e.target.value) }));
  }

  function handle(e: FormEvent) {
    e.preventDefault();
    onSubmit(v);
  }

  return (
    <form onSubmit={handle} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="col-span-2">
        <label className="block text-sm font-medium text-neutral-700 mb-1">Nome *</label>
        <input
          type="text"
          required
          minLength={2}
          value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value })}
          className="input"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">Tipo *</label>
        <select
          value={v.type}
          onChange={(e) => setV({ ...v, type: e.target.value })}
          className="input"
        >
          {SERVICE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Tipo de plano aceito *
        </label>
        <select
          value={v.acceptedPlanType}
          onChange={(e) => setV({ ...v, acceptedPlanType: e.target.value })}
          className="input"
        >
          {PLAN_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <NumField label="Duração (min)" value={v.durationMinutes} onChange={num('durationMinutes')} />
      <NumField label="Capacidade por slot" value={v.slotCapacity} onChange={num('slotCapacity')} />
      <NumField
        label="Antecedência p/ agendar (min)"
        value={v.schedulingLeadMinutes}
        onChange={num('schedulingLeadMinutes')}
      />
      <NumField
        label="Antecedência p/ cancelar (min)"
        value={v.cancellationLeadMinutes}
        onChange={num('cancellationLeadMinutes')}
      />
      <NumField
        label="Janela check-in antes (min)"
        value={v.checkInWindowBeforeMin}
        onChange={num('checkInWindowBeforeMin')}
      />
      <NumField
        label="Janela check-in depois (min)"
        value={v.checkInWindowAfterMin}
        onChange={num('checkInWindowAfterMin')}
      />
      <NumField
        label="Tolerância no-show (min)"
        value={v.noShowGraceMinutes}
        onChange={num('noShowGraceMinutes')}
      />
      <div className="flex items-center gap-2 pt-6">
        <input
          id="active"
          type="checkbox"
          checked={v.active}
          onChange={(e) => setV({ ...v, active: e.target.checked })}
          className="w-4 h-4 accent-brand-cyan"
        />
        <label htmlFor="active" className="text-sm font-medium text-neutral-700">
          Serviço ativo
        </label>
      </div>

      <div className="col-span-2 flex justify-end gap-2 pt-2">
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

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-neutral-700 mb-1">{label}</label>
      <input type="number" min={0} value={value} onChange={onChange} className="input" />
    </div>
  );
}
