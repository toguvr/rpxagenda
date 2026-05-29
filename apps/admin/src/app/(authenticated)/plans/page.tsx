'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  PlanStatus,
  UserRole,
  type PatientResponse,
  type PlanResponse,
  type PlanStatus as PlanStatusType,
  type ServiceResponse,
} from '@rpx/shared';
import { ApiError, api } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { Modal } from '@/components/Modal';
import { CreatePlanModal } from '@/components/CreatePlanModal';
import { SearchableSelect } from '@/components/SearchableSelect';

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'Aguardando pgto',
  ACTIVE: 'Ativo',
  PAST_DUE: 'Atrasado',
  SUSPENDED: 'Suspenso',
  EXPIRED: 'Expirado',
  CANCELLED: 'Cancelado',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING_PAYMENT: 'bg-yellow-50 text-yellow-700',
  ACTIVE: 'bg-green-50 text-green-700',
  PAST_DUE: 'bg-amber-50 text-amber-700',
  SUSPENDED: 'bg-red-50 text-red-700',
  EXPIRED: 'bg-neutral-100 text-neutral-500',
  CANCELLED: 'bg-neutral-100 text-neutral-500',
};

const TYPE_LABELS: Record<string, string> = {
  PACKAGE: 'Pacote',
  SUBSCRIPTION: 'Assinatura',
};

const FINAL_STATUSES = new Set(['EXPIRED', 'CANCELLED']);

export default function PlansPage() {
  const [plans, setPlans] = useState<PlanResponse[] | null>(null);
  const [patients, setPatients] = useState<Map<string, PatientResponse>>(new Map());
  const [services, setServices] = useState<Map<string, ServiceResponse>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // filtros
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [search, setSearch] = useState('');

  // criar plano
  const [createOpen, setCreateOpen] = useState(false);

  // mudança de status
  const [statusTarget, setStatusTarget] = useState<{
    plan: PlanResponse;
    status: PlanStatusType;
  } | null>(null);
  const [statusReason, setStatusReason] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    setIsAdmin(getCurrentUser()?.role === UserRole.ADMIN);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pl, pats, svcs] = await Promise.all([
          api<PlanResponse[]>('/plans'),
          api<PatientResponse[]>('/patients'),
          api<ServiceResponse[]>('/services?includeInactive=true'),
        ]);
        if (cancelled) return;
        setPlans(pl);
        setPatients(new Map(pats.map((p) => [p.id, p])));
        setServices(new Map(svcs.map((s) => [s.id, s])));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Falha ao carregar planos.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!plans) return null;
    const term = search.trim().toLowerCase();
    return plans.filter((p) => {
      if (statusFilter && p.status !== statusFilter) return false;
      if (typeFilter && p.type !== typeFilter) return false;
      if (serviceFilter && p.serviceId !== serviceFilter) return false;
      if (term) {
        const name = patients.get(p.patientId)?.fullName.toLowerCase() ?? '';
        if (!name.includes(term)) return false;
      }
      return true;
    });
  }, [plans, statusFilter, typeFilter, serviceFilter, search, patients]);

  async function confirmStatusChange() {
    if (!statusTarget) return;
    setStatusBusy(true);
    setStatusError(null);
    try {
      const updated = await api<PlanResponse>(`/plans/${statusTarget.plan.id}/status`, {
        method: 'PATCH',
        body: {
          status: statusTarget.status,
          ...(statusReason.trim() ? { reason: statusReason.trim() } : {}),
        },
      });
      setPlans((prev) => (prev ? prev.map((p) => (p.id === updated.id ? updated : p)) : prev));
      setStatusTarget(null);
      setStatusReason('');
    } catch (err) {
      setStatusError(err instanceof ApiError ? err.message : 'Falha ao alterar status.');
    } finally {
      setStatusBusy(false);
    }
  }

  function openStatus(plan: PlanResponse, status: PlanStatusType) {
    setStatusReason('');
    setStatusError(null);
    setStatusTarget({ plan, status });
  }

  const serviceList = useMemo(
    () => Array.from(services.values()).sort((a, b) => a.name.localeCompare(b.name)),
    [services],
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold text-brand-black">Planos</h1>
          <p className="text-sm text-neutral-500">
            {filtered
              ? `${filtered.length} plano${filtered.length !== 1 ? 's' : ''}`
              : 'Carregando…'}
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setCreateOpen(true)} className="btn-primary whitespace-nowrap">
            Novo plano
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por paciente…"
          className="input"
        />
        <SearchableSelect
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: '', label: 'Todos os status' },
            ...Object.values(PlanStatus).map((s) => ({ value: s, label: STATUS_LABELS[s] })),
          ]}
        />
        <SearchableSelect
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: '', label: 'Todos os tipos' },
            { value: 'PACKAGE', label: 'Pacote' },
            { value: 'SUBSCRIPTION', label: 'Assinatura' },
          ]}
        />
        <SearchableSelect
          value={serviceFilter}
          onChange={setServiceFilter}
          options={[
            { value: '', label: 'Todos os serviços' },
            ...serviceList.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {!filtered ? (
        <div className="text-neutral-400">Carregando…</div>
      ) : filtered.length === 0 ? (
        <div className="text-neutral-500 bg-white border border-neutral-200 rounded-lg p-8 text-center">
          Nenhum plano encontrado.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Serviço</th>
                <th>Tipo</th>
                <th>Status</th>
                <th>Saldo / Quota</th>
                <th>Validade</th>
                {isAdmin && <th>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const patient = patients.get(p.patientId);
                const service = services.get(p.serviceId);
                return (
                  <tr key={p.id}>
                    <td className="font-medium">
                      {patient ? (
                        <Link
                          href={`/patients/${patient.id}`}
                          className="hover:text-brand-cyanDark"
                        >
                          {patient.fullName}
                        </Link>
                      ) : (
                        p.patientId.slice(0, 8) + '…'
                      )}
                    </td>
                    <td>{service?.name ?? p.serviceId.slice(0, 8) + '…'}</td>
                    <td>{TYPE_LABELS[p.type] ?? p.type}</td>
                    <td>
                      <span
                        className={
                          'inline-block text-xs px-2 py-0.5 rounded-full font-medium ' +
                          (STATUS_COLORS[p.status] ?? 'bg-neutral-100 text-neutral-700')
                        }
                      >
                        {STATUS_LABELS[p.status] ?? p.status}
                      </span>
                    </td>
                    <td>
                      {p.type === 'PACKAGE'
                        ? `${p.remainingSessions ?? '—'} / ${p.totalSessions ?? '—'} sessões`
                        : `${p.weeklyUsage ?? 0} / ${p.weeklyQuota ?? '—'} por semana`}
                    </td>
                    <td>{p.type === 'PACKAGE' && p.validUntil ? formatDate(p.validUntil) : '—'}</td>
                    {isAdmin && (
                      <td>
                        {FINAL_STATUSES.has(p.status) ? (
                          <span className="text-xs text-neutral-400">—</span>
                        ) : (
                          <div className="flex gap-1.5">
                            {p.status !== 'ACTIVE' && (
                              <StatusBtn onClick={() => openStatus(p, PlanStatus.ACTIVE)}>
                                Ativar
                              </StatusBtn>
                            )}
                            {p.status !== 'SUSPENDED' && (
                              <StatusBtn onClick={() => openStatus(p, PlanStatus.SUSPENDED)}>
                                Suspender
                              </StatusBtn>
                            )}
                            <StatusBtn
                              variant="danger"
                              onClick={() => openStatus(p, PlanStatus.CANCELLED)}
                            >
                              Cancelar
                            </StatusBtn>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CreatePlanModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        patients={Array.from(patients.values())}
        services={Array.from(services.values())}
        onCreated={(plan) => {
          setPlans((prev) => [plan, ...(prev ?? [])]);
          setCreateOpen(false);
        }}
      />

      <Modal
        open={!!statusTarget}
        onClose={() => setStatusTarget(null)}
        title={statusTarget ? `Alterar status para “${STATUS_LABELS[statusTarget.status]}”` : ''}
      >
        {statusTarget && (
          <div className="space-y-3">
            <p className="text-sm text-neutral-600">
              {statusTarget.status === 'CANCELLED'
                ? 'O cancelamento encerra o plano (agendamentos já marcados são mantidos). Esta ação é auditada.'
                : 'A mudança de status é registrada na auditoria.'}
            </p>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Motivo (opcional)
              </label>
              <textarea
                rows={2}
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                className="input resize-none"
              />
            </div>
            {statusError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                {statusError}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setStatusTarget(null)} className="btn-outline">
                Voltar
              </button>
              <button
                onClick={confirmStatusChange}
                disabled={statusBusy}
                className={
                  'font-medium px-4 py-2 rounded text-white transition-colors disabled:opacity-50 ' +
                  (statusTarget.status === 'CANCELLED'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-brand-cyan hover:bg-brand-cyanDark')
                }
              >
                {statusBusy ? 'Salvando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function StatusBtn({
  children,
  onClick,
  variant = 'default',
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
}) {
  return (
    <button
      onClick={onClick}
      className={
        'text-xs font-medium px-2 py-1 rounded border transition-colors ' +
        (variant === 'danger'
          ? 'border-red-300 text-red-700 hover:bg-red-50'
          : 'border-neutral-300 text-brand-black hover:border-brand-cyan hover:text-brand-cyanDark')
      }
    >
      {children}
    </button>
  );
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}
