'use client';

import { useEffect, useState, FormEvent } from 'react';
import type { ProfessionalResponse, ServiceResponse } from '@rpx/shared';
import { ApiError, api } from '@/lib/api';

export interface ProfessionalCreateValues {
  email: string;
  password: string;
  fullName: string;
  registry: string;
  serviceIds: string[];
  active: boolean;
}

export interface ProfessionalUpdateValues {
  fullName: string;
  registry: string;
  serviceIds: string[];
  active: boolean;
}

/**
 * Form de profissional. No modo `create` inclui email + senha (cria o User
 * PROFESSIONAL junto). No modo `edit` esses campos somem — email/senha não
 * são editáveis por aqui.
 */
export function ProfessionalForm({
  mode,
  initial,
  busy,
  onCreate,
  onUpdate,
  onCancel,
}: {
  mode: 'create' | 'edit';
  initial?: ProfessionalResponse;
  busy: boolean;
  onCreate?: (v: ProfessionalCreateValues) => void;
  onUpdate?: (v: ProfessionalUpdateValues) => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState(initial?.fullName ?? '');
  const [registry, setRegistry] = useState(initial?.registry ?? '');
  const [active, setActive] = useState(initial?.active ?? true);
  const [serviceIds, setServiceIds] = useState<string[]>(initial?.serviceIds ?? []);

  const [services, setServices] = useState<ServiceResponse[]>([]);
  const [servicesError, setServicesError] = useState<string | null>(null);

  useEffect(() => {
    api<ServiceResponse[]>('/services?includeInactive=true')
      .then(setServices)
      .catch((err) =>
        setServicesError(err instanceof ApiError ? err.message : 'Falha ao carregar serviços.'),
      );
  }, []);

  function toggleService(id: string) {
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handle(e: FormEvent) {
    e.preventDefault();
    if (mode === 'create') {
      onCreate?.({ email, password, fullName, registry, serviceIds, active });
    } else {
      onUpdate?.({ fullName, registry, serviceIds, active });
    }
  }

  return (
    <form onSubmit={handle} className="space-y-4 max-w-lg">
      {mode === 'create' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">E-mail *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Senha inicial *
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
            />
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">Nome completo *</label>
        <input
          type="text"
          required
          minLength={3}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="input"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Registro (CREFITO/CREF) *
        </label>
        <input
          type="text"
          required
          minLength={2}
          value={registry}
          onChange={(e) => setRegistry(e.target.value)}
          className="input"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-2">
          Serviços que atende
        </label>
        {servicesError ? (
          <div className="text-sm text-red-700">{servicesError}</div>
        ) : services.length === 0 ? (
          <p className="text-sm text-neutral-500">Nenhum serviço cadastrado ainda.</p>
        ) : (
          <div className="space-y-1">
            {services.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={serviceIds.includes(s.id)}
                  onChange={() => toggleService(s.id)}
                  className="w-4 h-4 accent-brand-cyan"
                />
                {s.name}
                {!s.active && <span className="text-xs text-neutral-400">(inativo)</span>}
              </label>
            ))}
          </div>
        )}
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
          Profissional ativo
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="btn-outline">
          Cancelar
        </button>
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? 'Salvando…' : mode === 'create' ? 'Cadastrar' : 'Salvar alterações'}
        </button>
      </div>
    </form>
  );
}
