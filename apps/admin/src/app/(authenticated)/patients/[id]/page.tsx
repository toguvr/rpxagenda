'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import type {
  AppointmentResponse,
  InviteResponse,
  PatientResponse,
  PlanResponse,
  ServiceResponse,
} from '@rpx/shared';
import { ApiError, api } from '@/lib/api';
import { Card } from '@/components/Card';
import { Modal } from '@/components/Modal';
import { CopyButton } from '@/components/CopyButton';
import { CreatePlanModal } from '@/components/CreatePlanModal';

type TabKey = 'plans' | 'appointments';

export default function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [patient, setPatient] = useState<PatientResponse | null>(null);
  const [plans, setPlans] = useState<PlanResponse[] | null>(null);
  const [appointments, setAppointments] = useState<AppointmentResponse[] | null>(null);
  const [serviceMap, setServiceMap] = useState<Map<string, ServiceResponse>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<TabKey>('plans');

  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [invite, setInvite] = useState<InviteResponse | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);

  const [createPlanOpen, setCreatePlanOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, ps, ap, svcs] = await Promise.all([
          api<PatientResponse>(`/patients/${id}`),
          api<PlanResponse[]>(`/patients/${id}/plans`),
          api<AppointmentResponse[]>(`/appointments?patientId=${id}`),
          api<ServiceResponse[]>('/services?includeInactive=true'),
        ]);
        if (cancelled) return;
        setPatient(p);
        setPlans(ps);
        setAppointments(ap);
        setServiceMap(new Map(svcs.map((s) => [s.id, s])));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Falha ao carregar paciente.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleGenerateInvite() {
    setInviteError(null);
    setInviteLoading(true);
    try {
      const inv = await api<InviteResponse>(`/patients/${id}/invites`, { method: 'POST' });
      setInvite(inv);
      setInviteModalOpen(true);
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : 'Falha ao gerar convite.');
    } finally {
      setInviteLoading(false);
    }
  }

  if (error) {
    return (
      <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
        {error}
      </div>
    );
  }
  if (!patient) return <div className="text-neutral-400">Carregando…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/patients" className="text-sm text-brand-cyanDark hover:underline">
            ← pacientes
          </Link>
          <h1 className="text-2xl font-bold text-brand-black mt-1">{patient.fullName}</h1>
          <p className="text-sm text-neutral-500">
            CPF {formatCpf(patient.cpf)} · {patient.phone}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!patient.hasUserAccount && (
            <button
              onClick={handleGenerateInvite}
              disabled={inviteLoading || !patient.email}
              className="btn-primary"
              title={!patient.email ? 'Adicione um e-mail para gerar convite' : undefined}
            >
              {inviteLoading ? 'Gerando…' : 'Gerar convite'}
            </button>
          )}
        </div>
      </div>

      {inviteError && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {inviteError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card title="Identificação">
          <dl className="text-sm space-y-2">
            <div className="flex justify-between">
              <dt className="text-neutral-500">E-mail</dt>
              <dd>{patient.email ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">Nascimento</dt>
              <dd>{formatDate(patient.birthDate)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">Cadastrado em</dt>
              <dd>{formatDate(patient.createdAt)}</dd>
            </div>
          </dl>
        </Card>
        <Card title="Acesso ao app">
          <div className="text-sm">
            {patient.hasUserAccount ? (
              <span className="text-brand-cyanDark font-medium">Conta criada</span>
            ) : (
              <>
                <span className="text-neutral-500">Convite ainda não foi redeemido.</span>
                {!patient.email && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-2">
                    Cadastre um e-mail para enviar o convite.
                  </p>
                )}
              </>
            )}
          </div>
        </Card>
        <Card title="iDFace">
          <div className="text-sm">
            {patient.hasIdfaceEnrolled ? (
              <span className="text-brand-cyanDark font-medium">Biometria cadastrada</span>
            ) : (
              <span className="text-neutral-500">Pendente — fazer no equipamento.</span>
            )}
          </div>
        </Card>
      </div>

      {patient.emergencyContact || patient.notes ? (
        <Card title="Observações">
          {patient.emergencyContact && (
            <div className="text-sm mb-2">
              <span className="text-neutral-500">Emergência: </span>
              {patient.emergencyContact}
            </div>
          )}
          {patient.notes && (
            <p className="text-sm whitespace-pre-wrap text-neutral-700">{patient.notes}</p>
          )}
        </Card>
      ) : null}

      {/* Abas */}
      <div className="border-b border-neutral-200 flex items-center justify-between">
        <nav className="flex gap-1">
          <TabButton active={tab === 'plans'} onClick={() => setTab('plans')}>
            Planos ({plans?.length ?? 0})
          </TabButton>
          <TabButton active={tab === 'appointments'} onClick={() => setTab('appointments')}>
            Agendamentos ({appointments?.length ?? 0})
          </TabButton>
        </nav>
        {tab === 'plans' && (
          <button
            onClick={() => setCreatePlanOpen(true)}
            className="text-sm font-medium text-brand-cyanDark hover:underline mb-1"
          >
            + Criar plano
          </button>
        )}
      </div>

      {tab === 'plans' && <PlansList plans={plans} services={serviceMap} />}
      {tab === 'appointments' && (
        <AppointmentsList appointments={appointments} services={serviceMap} />
      )}

      <CreatePlanModal
        open={createPlanOpen}
        onClose={() => setCreatePlanOpen(false)}
        patientId={id}
        services={Array.from(serviceMap.values())}
        onCreated={(plan) => setPlans((prev) => [plan, ...(prev ?? [])])}
      />

      <Modal
        open={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title="Convite gerado"
      >
        {invite && (
          <div className="space-y-3">
            <p className="text-sm text-neutral-600">
              Envie este link para o paciente. Expira em{' '}
              <strong>{formatDate(invite.expiresAt)}</strong>.
            </p>
            <div className="bg-neutral-50 border border-neutral-200 rounded p-3 break-all">
              <div className="text-xs text-neutral-500 mb-1">Token</div>
              <div className="font-mono text-sm">{invite.token}</div>
              <div className="mt-2">
                <CopyButton value={invite.token} label="Copiar token" />
              </div>
            </div>
            <div className="bg-neutral-50 border border-neutral-200 rounded p-3 break-all">
              <div className="text-xs text-neutral-500 mb-1">URL de redemption (app/mobile)</div>
              <div className="font-mono text-xs">{redeemUrl(invite.token)}</div>
              <div className="mt-2">
                <CopyButton value={redeemUrl(invite.token)} label="Copiar URL" />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={() => setInviteModalOpen(false)} className="btn-outline">
                Fechar
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function PlansList({
  plans,
  services,
}: {
  plans: PlanResponse[] | null;
  services: Map<string, ServiceResponse>;
}) {
  if (!plans) return <div className="text-neutral-400">Carregando…</div>;
  if (plans.length === 0)
    return (
      <div className="text-neutral-500 bg-white border border-neutral-200 rounded-lg p-8 text-center">
        Sem planos ainda.
      </div>
    );
  return (
    <div className="table-wrap">
      <table className="table-base">
        <thead>
          <tr>
            <th>Serviço</th>
            <th>Tipo</th>
            <th>Status</th>
            <th>Saldo / Quota</th>
            <th>Validade</th>
          </tr>
        </thead>
        <tbody>
          {plans.map((p) => (
            <tr key={p.id}>
              <td className="font-medium">
                {services.get(p.serviceId)?.name ?? p.serviceId.slice(0, 8)}
              </td>
              <td>{p.type}</td>
              <td>
                <StatusBadge>{p.status}</StatusBadge>
              </td>
              <td>
                {p.type === 'PACKAGE'
                  ? `${p.remainingSessions ?? '—'} / ${p.totalSessions ?? '—'}`
                  : `${p.weeklyUsage ?? 0} / ${p.weeklyQuota ?? '—'} por semana`}
              </td>
              <td>{p.validUntil ? formatDate(p.validUntil) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AppointmentsList({
  appointments,
  services,
}: {
  appointments: AppointmentResponse[] | null;
  services: Map<string, ServiceResponse>;
}) {
  if (!appointments) return <div className="text-neutral-400">Carregando…</div>;
  if (appointments.length === 0)
    return (
      <div className="text-neutral-500 bg-white border border-neutral-200 rounded-lg p-8 text-center">
        Sem agendamentos ainda.
      </div>
    );
  return (
    <div className="table-wrap">
      <table className="table-base">
        <thead>
          <tr>
            <th>Quando</th>
            <th>Serviço</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {appointments
            .slice()
            .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())
            .map((a) => (
              <tr key={a.id}>
                <td className="font-mono text-xs">{formatDateTime(a.startsAt)}</td>
                <td>{services.get(a.serviceId)?.name ?? a.serviceId.slice(0, 8)}</td>
                <td>
                  <StatusBadge>{a.status}</StatusBadge>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'px-4 py-2 text-sm font-medium border-b-2 transition-colors ' +
        (active
          ? 'text-brand-black border-brand-cyan'
          : 'text-neutral-500 border-transparent hover:text-brand-black')
      }
    >
      {children}
    </button>
  );
}

function StatusBadge({ children }: { children: string }) {
  const color =
    {
      ACTIVE: 'bg-green-50 text-green-700',
      PENDING_PAYMENT: 'bg-yellow-50 text-yellow-700',
      PAST_DUE: 'bg-yellow-50 text-yellow-700',
      SUSPENDED: 'bg-red-50 text-red-700',
      EXPIRED: 'bg-neutral-100 text-neutral-500',
      CANCELLED: 'bg-neutral-100 text-neutral-500',
      SCHEDULED: 'bg-neutral-100 text-neutral-700',
      CONFIRMED: 'bg-blue-50 text-blue-700',
      CHECKED_IN: 'bg-brand-cyanLight text-brand-cyanDark',
      COMPLETED: 'bg-green-50 text-green-700',
      NO_SHOW: 'bg-red-50 text-red-700',
    }[children] ?? 'bg-neutral-100 text-neutral-700';
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>
      {children}
    </span>
  );
}

function formatCpf(cpf: string): string {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatDateTime(d: Date | string): string {
  const date = new Date(d);
  return (
    date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) +
    ' ' +
    date.toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
    })
  );
}

function redeemUrl(token: string): string {
  // A URL real depende do domínio do app/admin. Para dev devolvemos
  // um path absoluto do próprio admin pra inspeção.
  if (typeof window === 'undefined') return `/patient-invites/${token}/redeem`;
  return `${window.location.origin}/patient-invites/${token}/redeem`;
}
