'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type {
  AppointmentResponse,
  EquipmentResponse,
  InviteResponse,
  MedicalRecordResponse,
  PatientResponse,
  PlanResponse,
  ProfessionalResponse,
  ProtocolResponse,
  ServiceResponse,
} from '@rpx/shared';
import { UserRole } from '@rpx/shared';
import { ApiError, api } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { Card } from '@/components/Card';
import { Modal } from '@/components/Modal';
import { CopyButton } from '@/components/CopyButton';
import { CreatePlanModal } from '@/components/CreatePlanModal';
import { CreateProtocolModal } from '@/components/CreateProtocolModal';
import { RecurringScheduleModal } from '@/components/RecurringScheduleModal';
import { MedicalRecordModal } from '@/components/MedicalRecordModal';
import { PatientPhoto } from '@/components/PatientPhoto';

type TabKey = 'plans' | 'protocols' | 'appointments' | 'records';

export default function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const registerEval = searchParams.get('registerEval');
  const evolucaoAppt = searchParams.get('evolucao');

  const [patient, setPatient] = useState<PatientResponse | null>(null);
  const [plans, setPlans] = useState<PlanResponse[] | null>(null);
  const [protocols, setProtocols] = useState<ProtocolResponse[] | null>(null);
  const [records, setRecords] = useState<MedicalRecordResponse[] | null>(null);
  const [appointments, setAppointments] = useState<AppointmentResponse[] | null>(null);
  const [serviceMap, setServiceMap] = useState<Map<string, ServiceResponse>>(new Map());
  const [professionals, setProfessionals] = useState<ProfessionalResponse[]>([]);
  const [equipments, setEquipments] = useState<EquipmentResponse[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<TabKey>('plans');

  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [invite, setInvite] = useState<InviteResponse | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);

  const [createPlanOpen, setCreatePlanOpen] = useState(false);
  const [createProtocolOpen, setCreateProtocolOpen] = useState(false);

  // filtro de data dos agendamentos
  const [apptFrom, setApptFrom] = useState('');
  const [apptTo, setApptTo] = useState('');

  // agendamento recorrente
  const [recurringPlan, setRecurringPlan] = useState<PlanResponse | null>(null);

  // evolução (prontuário)
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<MedicalRecordResponse | null>(null);
  const [recordApptId, setRecordApptId] = useState<string | null>(null);

  async function reloadAppointments() {
    try {
      setAppointments(await api<AppointmentResponse[]>(`/appointments?patientId=${id}`));
    } catch {
      /* mantém a lista atual */
    }
  }

  async function reloadRecords() {
    try {
      setRecords(await api<MedicalRecordResponse[]>(`/patients/${id}/medical-records`));
    } catch {
      /* mantém a lista atual */
    }
  }

  const [isAdmin, setIsAdmin] = useState(false);
  const [adminRef, setAdminRef] = useState('');
  const [savingRef, setSavingRef] = useState(false);
  const [refMsg, setRefMsg] = useState<string | null>(null);

  useEffect(() => {
    setIsAdmin(getCurrentUser()?.role === UserRole.ADMIN);
  }, []);

  // Vindo de "Registrar avaliação" no agendamento: abre o modal de protocolo
  // já vinculado àquele appointment.
  useEffect(() => {
    if (registerEval) {
      setTab('protocols');
      setCreateProtocolOpen(true);
    }
  }, [registerEval]);

  // Vindo de "Registrar evolução" no agendamento: abre o modal de evolução
  // já vinculado àquele appointment.
  useEffect(() => {
    if (evolucaoAppt) {
      setTab('records');
      setEditingRecord(null);
      setRecordApptId(evolucaoAppt);
      setRecordModalOpen(true);
    }
  }, [evolucaoAppt]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, ps, prot, recs, ap, svcs, profs, eqs] = await Promise.all([
          api<PatientResponse>(`/patients/${id}`),
          api<PlanResponse[]>(`/patients/${id}/plans`),
          api<ProtocolResponse[]>(`/patients/${id}/protocols`),
          api<MedicalRecordResponse[]>(`/patients/${id}/medical-records`),
          api<AppointmentResponse[]>(`/appointments?patientId=${id}`),
          api<ServiceResponse[]>('/services?includeInactive=true'),
          api<ProfessionalResponse[]>('/professionals'),
          api<EquipmentResponse[]>('/equipments'),
        ]);
        if (cancelled) return;
        setPatient(p);
        setAdminRef(p.adminReference ?? '');
        setPlans(ps);
        setProtocols(prot);
        setRecords(recs);
        setAppointments(ap);
        setServiceMap(new Map(svcs.map((s) => [s.id, s])));
        setProfessionals(profs);
        setEquipments(eqs);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Falha ao carregar paciente.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const professionalMap = useMemo(
    () => new Map(professionals.map((p) => [p.id, p])),
    [professionals],
  );
  const equipmentMap = useMemo(() => new Map(equipments.map((e) => [e.id, e])), [equipments]);

  // Planos sem protocolo ativo — só esses podem receber uma nova avaliação.
  const eligiblePlans = useMemo(() => {
    const planIdsWithActive = new Set(
      (protocols ?? []).filter((pr) => pr.active).map((pr) => pr.planId),
    );
    return (plans ?? []).filter((p) => !planIdsWithActive.has(p.id));
  }, [plans, protocols]);

  const defaultProfessionalId = useMemo(() => {
    const u = getCurrentUser();
    return professionals.find((p) => p.userId === u?.id)?.id ?? '';
  }, [professionals]);

  const filteredAppointments = useMemo(() => {
    if (!appointments) return null;
    const from = apptFrom ? new Date(`${apptFrom}T00:00:00`) : null;
    const to = apptTo ? new Date(`${apptTo}T23:59:59`) : null;
    return appointments.filter((a) => {
      const d = new Date(a.startsAt);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [appointments, apptFrom, apptTo]);

  async function handleSaveAdminRef() {
    setSavingRef(true);
    setRefMsg(null);
    try {
      const updated = await api<PatientResponse>(`/patients/${id}`, {
        method: 'PATCH',
        body: { adminReference: adminRef.trim() },
      });
      setPatient(updated);
      setAdminRef(updated.adminReference ?? '');
      setRefMsg('Salvo.');
    } catch (err) {
      setRefMsg(err instanceof ApiError ? err.message : 'Falha ao salvar.');
    } finally {
      setSavingRef(false);
    }
  }

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

      <Card title="Foto do paciente">
        <PatientPhoto patientId={id} />
      </Card>

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

      {isAdmin && (
        <Card title="Apelido / referência (interno)">
          <p className="mb-2 text-xs text-neutral-500">
            Visível apenas para administradores — profissionais e o paciente não veem este campo.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={adminRef}
              onChange={(e) => {
                setAdminRef(e.target.value);
                setRefMsg(null);
              }}
              maxLength={200}
              placeholder="Ex.: indicação Dra. Ana, paciente VIP, nome social…"
              className="input sm:flex-1"
            />
            <button
              onClick={handleSaveAdminRef}
              disabled={savingRef || adminRef.trim() === (patient.adminReference ?? '')}
              className="btn-primary whitespace-nowrap"
            >
              {savingRef ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
          {refMsg && <p className="mt-2 text-xs text-neutral-500">{refMsg}</p>}
        </Card>
      )}

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
          <TabButton active={tab === 'protocols'} onClick={() => setTab('protocols')}>
            Avaliações ({protocols?.length ?? 0})
          </TabButton>
          <TabButton active={tab === 'records'} onClick={() => setTab('records')}>
            Evolução ({records?.length ?? 0})
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
        {tab === 'protocols' && (
          <button
            onClick={() => setCreateProtocolOpen(true)}
            className="text-sm font-medium text-brand-cyanDark hover:underline mb-1"
          >
            + Registrar avaliação
          </button>
        )}
        {tab === 'records' && (
          <button
            onClick={() => {
              setEditingRecord(null);
              setRecordApptId(null);
              setRecordModalOpen(true);
            }}
            className="text-sm font-medium text-brand-cyanDark hover:underline mb-1"
          >
            + Registrar evolução
          </button>
        )}
      </div>

      {tab === 'plans' && (
        <PlansList plans={plans} services={serviceMap} onSchedule={setRecurringPlan} />
      )}
      {tab === 'protocols' && (
        <ProtocolsList
          protocols={protocols}
          services={serviceMap}
          plans={plans}
          professionals={professionalMap}
          equipments={equipmentMap}
        />
      )}
      {tab === 'records' && (
        <MedicalRecordsList
          records={records}
          professionals={professionalMap}
          canEdit={(r) => isAdmin || r.professionalId === defaultProfessionalId}
          onEdit={(r) => {
            setEditingRecord(r);
            setRecordApptId(null);
            setRecordModalOpen(true);
          }}
        />
      )}
      {tab === 'appointments' && (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="text-sm text-neutral-600">De</label>
            <input
              type="date"
              value={apptFrom}
              onChange={(e) => setApptFrom(e.target.value)}
              className="input sm:max-w-[12rem]"
            />
            <label className="text-sm text-neutral-600">até</label>
            <input
              type="date"
              value={apptTo}
              onChange={(e) => setApptTo(e.target.value)}
              className="input sm:max-w-[12rem]"
            />
            {(apptFrom || apptTo) && (
              <button
                onClick={() => {
                  setApptFrom('');
                  setApptTo('');
                }}
                className="text-sm font-medium text-brand-cyanDark hover:underline"
              >
                limpar
              </button>
            )}
          </div>
          <AppointmentsList appointments={filteredAppointments} services={serviceMap} />
        </div>
      )}

      <CreatePlanModal
        open={createPlanOpen}
        onClose={() => setCreatePlanOpen(false)}
        patientId={id}
        services={Array.from(serviceMap.values())}
        onCreated={(plan) => setPlans((prev) => [plan, ...(prev ?? [])])}
      />

      <CreateProtocolModal
        open={createProtocolOpen}
        onClose={() => setCreateProtocolOpen(false)}
        patientId={id}
        plans={eligiblePlans}
        services={serviceMap}
        professionals={professionals}
        equipments={equipments}
        defaultProfessionalId={defaultProfessionalId}
        appointmentId={registerEval ?? undefined}
        onCreated={(protocol) => {
          setProtocols((prev) => [protocol, ...(prev ?? [])]);
          setCreateProtocolOpen(false);
        }}
      />

      <RecurringScheduleModal
        open={!!recurringPlan}
        onClose={() => setRecurringPlan(null)}
        plan={recurringPlan}
        serviceName={
          recurringPlan ? (serviceMap.get(recurringPlan.serviceId)?.name ?? 'Serviço') : ''
        }
        patientId={id}
        onDone={reloadAppointments}
      />

      <MedicalRecordModal
        open={recordModalOpen}
        onClose={() => setRecordModalOpen(false)}
        patientId={id}
        professionals={professionals}
        defaultProfessionalId={defaultProfessionalId}
        appointmentId={recordApptId ?? undefined}
        editing={editingRecord}
        onSaved={reloadRecords}
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
  onSchedule,
}: {
  plans: PlanResponse[] | null;
  services: Map<string, ServiceResponse>;
  onSchedule: (plan: PlanResponse) => void;
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
            <th>Ações</th>
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
              <td>
                {p.status === 'ACTIVE' ? (
                  <button
                    onClick={() => onSchedule(p)}
                    className="text-xs font-medium text-brand-cyanDark hover:underline whitespace-nowrap"
                  >
                    Agendar recorrente
                  </button>
                ) : (
                  <span className="text-xs text-neutral-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProtocolsList({
  protocols,
  services,
  plans,
  professionals,
  equipments,
}: {
  protocols: ProtocolResponse[] | null;
  services: Map<string, ServiceResponse>;
  plans: PlanResponse[] | null;
  professionals: Map<string, ProfessionalResponse>;
  equipments: Map<string, EquipmentResponse>;
}) {
  if (!protocols) return <div className="text-neutral-400">Carregando…</div>;
  if (protocols.length === 0)
    return (
      <div className="text-neutral-500 bg-white border border-neutral-200 rounded-lg p-8 text-center">
        Nenhuma avaliação registrada. Clique em “+ Registrar avaliação” para começar.
      </div>
    );

  const planService = (planId: string | null) => {
    if (!planId) return null;
    const plan = plans?.find((p) => p.id === planId);
    return plan ? (services.get(plan.serviceId)?.name ?? 'Serviço') : null;
  };

  return (
    <div className="space-y-3">
      {protocols.map((pr) => (
        <div key={pr.id} className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-brand-black">
                  {professionals.get(pr.professionalId)?.fullName ?? 'Profissional'}
                </span>
                {pr.active ? (
                  <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                    ativo
                  </span>
                ) : (
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
                    inativo
                  </span>
                )}
              </div>
              <div className="text-xs text-neutral-500">
                {pr.planId
                  ? planService(pr.planId)
                    ? `${planService(pr.planId)} · `
                    : ''
                  : 'Sem plano · '}
                {formatDate(pr.createdAt)}
              </div>
            </div>
            <div className="text-right text-sm text-neutral-600">
              <span className="font-medium text-brand-black">{pr.totalSessions}</span> sessões ·{' '}
              <span className="font-medium text-brand-black">{pr.sessionsPerWeek}</span>/semana
            </div>
          </div>

          <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-800">{pr.diagnosis}</p>
          {pr.observations && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-600">
              <span className="text-neutral-400">Observações: </span>
              {pr.observations}
            </p>
          )}

          {pr.equipmentIds.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {pr.equipmentIds.map((eqId) => (
                <span
                  key={eqId}
                  className="rounded-full bg-brand-cyanLight px-2 py-0.5 text-xs font-medium text-brand-cyanDark"
                >
                  {equipments.get(eqId)?.name ?? eqId.slice(0, 8)}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function MedicalRecordsList({
  records,
  professionals,
  canEdit,
  onEdit,
}: {
  records: MedicalRecordResponse[] | null;
  professionals: Map<string, ProfessionalResponse>;
  canEdit: (r: MedicalRecordResponse) => boolean;
  onEdit: (r: MedicalRecordResponse) => void;
}) {
  if (!records) return <div className="text-neutral-400">Carregando…</div>;
  if (records.length === 0)
    return (
      <div className="text-neutral-500 bg-white border border-neutral-200 rounded-lg p-8 text-center">
        Nenhuma evolução registrada. Clique em “+ Registrar evolução”.
      </div>
    );
  return (
    <div className="space-y-3">
      {records.map((r) => (
        <div key={r.id} className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="text-xs text-neutral-500">
              <span className="font-medium text-brand-black">
                {professionals.get(r.professionalId)?.fullName ?? 'Profissional'}
              </span>{' '}
              · {formatDateTime(r.createdAt)}
              {r.appointmentId && ' · sessão'}
            </div>
            {canEdit(r) && (
              <button
                onClick={() => onEdit(r)}
                className="text-xs font-medium text-brand-cyanDark hover:underline"
              >
                editar
              </button>
            )}
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-800">{r.content}</p>
        </div>
      ))}
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
