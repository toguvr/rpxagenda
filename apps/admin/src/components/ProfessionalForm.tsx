'use client';

import { useEffect, useState, FormEvent } from 'react';
import { SCREENS, type ProfessionalResponse, type ServiceResponse } from '@rpx/shared';
import { ApiError, api } from '@/lib/api';

export interface ProfessionalCreateValues {
  email: string;
  fullName: string;
  registry: string;
  serviceIds: string[];
  allowedScreens: string[];
  active: boolean;
}

export interface ProfessionalUpdateValues {
  fullName: string;
  registry: string;
  serviceIds: string[];
  allowedScreens: string[];
  active: boolean;
}

/**
 * Form de profissional. No modo `create` inclui o e-mail (para onde vai o
 * convite de acesso — o profissional define a própria senha pelo link). A senha
 * não é definida aqui. Em ambos os modos escolhe-se as telas que ele pode
 * acessar no painel.
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
  const [email, setEmail] = useState(initial?.email ?? '');
  const [fullName, setFullName] = useState(initial?.fullName ?? '');
  const [registry, setRegistry] = useState(initial?.registry ?? '');
  const [active, setActive] = useState(initial?.active ?? true);
  const [serviceIds, setServiceIds] = useState<string[]>(initial?.serviceIds ?? []);
  const [allowedScreens, setAllowedScreens] = useState<string[]>(initial?.allowedScreens ?? []);

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

  function toggleScreen(key: string) {
    setAllowedScreens((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key],
    );
  }

  function handle(e: FormEvent) {
    e.preventDefault();
    if (mode === 'create') {
      onCreate?.({ email, fullName, registry, serviceIds, allowedScreens, active });
    } else {
      onUpdate?.({ fullName, registry, serviceIds, allowedScreens, active });
    }
  }

  // Telas concedidas cujas dependências não foram marcadas (aviso amigável).
  const missingDeps = SCREENS.filter(
    (s) =>
      allowedScreens.includes(s.key) &&
      (s.dependsOn ?? []).some((dep) => !allowedScreens.includes(dep)),
  );

  return (
    <form onSubmit={handle} className="space-y-4 max-w-lg">
      {mode === 'create' && (
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">E-mail *</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />
          <p className="mt-1 text-xs text-neutral-500">
            O convite para criar a senha de acesso será enviado para este e-mail.
          </p>
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

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-neutral-700">
            Telas que pode acessar no painel
          </label>
          <button
            type="button"
            onClick={() =>
              setAllowedScreens(
                allowedScreens.length === SCREENS.length ? [] : SCREENS.map((s) => s.key),
              )
            }
            className="text-xs text-brand-cyanDark hover:underline"
          >
            {allowedScreens.length === SCREENS.length ? 'Limpar' : 'Selecionar todas'}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {SCREENS.map((s) => (
            <label key={s.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allowedScreens.includes(s.key)}
                onChange={() => toggleScreen(s.key)}
                className="w-4 h-4 accent-brand-cyan"
              />
              {s.label}
            </label>
          ))}
        </div>
        {allowedScreens.length === 0 && (
          <p className="mt-1 text-xs text-amber-600">
            Sem nenhuma tela marcada, o profissional consegue logar mas não verá nenhuma página.
          </p>
        )}
        {missingDeps.length > 0 && (
          <p className="mt-1 text-xs text-amber-600">
            {missingDeps.map((s) => s.label).join(', ')} costuma depender de outras telas (ex:
            Pacientes e Serviços) para os campos de seleção funcionarem.
          </p>
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
          {busy
            ? 'Salvando…'
            : mode === 'create'
              ? 'Cadastrar e enviar convite'
              : 'Salvar alterações'}
        </button>
      </div>
    </form>
  );
}
