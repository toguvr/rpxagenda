'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { AppointmentResponse, PatientResponse, ServiceResponse } from '@rpx/shared';
import { ApiError, api } from '@/lib/api';
import { Modal } from '@/components/Modal';

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Agendado',
  CONFIRMED: 'Confirmado',
  CHECKED_IN: 'Check-in',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
  NO_SHOW: 'Faltou',
};

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: 'bg-neutral-100 text-neutral-700',
  CONFIRMED: 'bg-blue-50 text-blue-700',
  CHECKED_IN: 'bg-brand-cyanLight text-brand-cyanDark',
  COMPLETED: 'bg-green-50 text-green-700',
  CANCELLED: 'bg-neutral-100 text-neutral-500',
  NO_SHOW: 'bg-red-50 text-red-700',
};

export default function AppointmentsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [appointments, setAppointments] = useState<AppointmentResponse[] | null>(null);
  const [patients, setPatients] = useState<Map<string, PatientResponse>>(new Map());
  const [services, setServices] = useState<Map<string, ServiceResponse>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // modal de cancelamento
  const [cancelTarget, setCancelTarget] = useState<AppointmentResponse | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [pList, sList] = await Promise.all([
          api<PatientResponse[]>('/patients'),
          api<ServiceResponse[]>('/services?includeInactive=true'),
        ]);
        setPatients(new Map(pList.map((p) => [p.id, p])));
        setServices(new Map(sList.map((s) => [s.id, s])));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Falha ao buscar metadados.');
      }
    })();
  }, []);

  const loadAppointments = useCallback(() => {
    setAppointments(null);
    setError(null);
    const from = `${date}T00:00:00.000Z`;
    const to = `${date}T23:59:59.999Z`;
    api<AppointmentResponse[]>(`/appointments?fromDate=${from}&toDate=${to}`)
      .then((list) => setAppointments(list))
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Falha ao buscar agendamentos.'),
      );
  }, [date]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  const sorted = useMemo(
    () =>
      appointments
        ?.slice()
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [appointments],
  );

  async function runAction(id: string, path: string, body?: unknown) {
    setBusyId(id);
    setActionError(null);
    try {
      await api(`/appointments/${id}/${path}`, { method: 'POST', body });
      loadAppointments();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Falha na ação.');
    } finally {
      setBusyId(null);
    }
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    const id = cancelTarget.id;
    setCancelTarget(null);
    await runAction(id, 'cancel', cancelReason.trim() ? { reason: cancelReason.trim() } : {});
    setCancelReason('');
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-black">Agenda</h1>
          <p className="text-sm text-neutral-500">
            {appointments
              ? `${appointments.length} agendamento${appointments.length !== 1 ? 's' : ''}`
              : 'Carregando…'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input max-w-xs"
          />
          <Link href="/appointments/new" className="btn-primary whitespace-nowrap">
            Novo agendamento
          </Link>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
          {error}
        </div>
      )}
      {actionError && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
          {actionError}
        </div>
      )}

      {!sorted ? (
        <div className="text-neutral-400">Carregando…</div>
      ) : sorted.length === 0 ? (
        <div className="text-neutral-500 bg-white border border-neutral-200 rounded-lg p-8 text-center">
          Nenhum agendamento para essa data.
        </div>
      ) : (
        <table className="table-base">
          <thead>
            <tr>
              <th>Horário</th>
              <th>Paciente</th>
              <th>Serviço</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => {
              const p = patients.get(a.patientId);
              const s = services.get(a.serviceId);
              return (
                <tr key={a.id}>
                  <td className="font-mono text-xs">
                    {formatTime(a.startsAt)} — {formatTime(a.endsAt)}
                  </td>
                  <td className="font-medium">
                    {p ? (
                      <Link href={`/patients/${p.id}`} className="hover:text-brand-cyanDark">
                        {p.fullName}
                      </Link>
                    ) : (
                      a.patientId.slice(0, 8) + '…'
                    )}
                  </td>
                  <td>{s?.name ?? a.serviceId.slice(0, 8) + '…'}</td>
                  <td>
                    <span
                      className={
                        'inline-block text-xs px-2 py-0.5 rounded-full font-medium ' +
                        (STATUS_COLORS[a.status] ?? 'bg-neutral-100 text-neutral-700')
                      }
                    >
                      {STATUS_LABELS[a.status] ?? a.status}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-1.5">
                      {a.status === 'SCHEDULED' && (
                        <ActionBtn
                          busy={busyId === a.id}
                          onClick={() => runAction(a.id, 'confirm')}
                        >
                          Confirmar
                        </ActionBtn>
                      )}
                      {(a.status === 'SCHEDULED' || a.status === 'CONFIRMED') && (
                        <ActionBtn
                          busy={busyId === a.id}
                          onClick={() => runAction(a.id, 'check-in')}
                        >
                          Check-in
                        </ActionBtn>
                      )}
                      {a.status === 'CHECKED_IN' && (
                        <ActionBtn
                          busy={busyId === a.id}
                          onClick={() => runAction(a.id, 'complete')}
                        >
                          Concluir
                        </ActionBtn>
                      )}
                      {(a.status === 'SCHEDULED' || a.status === 'CONFIRMED') && (
                        <ActionBtn
                          busy={busyId === a.id}
                          variant="danger"
                          onClick={() => {
                            setCancelReason('');
                            setCancelTarget(a);
                          }}
                        >
                          Cancelar
                        </ActionBtn>
                      )}
                      {['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(a.status) && (
                        <span className="text-xs text-neutral-400">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <Modal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Cancelar agendamento"
      >
        <div className="space-y-3">
          <p className="text-sm text-neutral-600">
            Cancelar o agendamento de{' '}
            <strong>
              {cancelTarget ? (patients.get(cancelTarget.patientId)?.fullName ?? 'paciente') : ''}
            </strong>
            ? Dentro do prazo de cancelamento a sessão volta para o plano; fora do prazo é
            descontada.
          </p>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Motivo (opcional)
            </label>
            <textarea
              rows={2}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="input resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setCancelTarget(null)} className="btn-outline">
              Voltar
            </button>
            <button
              onClick={confirmCancel}
              className="bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded transition-colors"
            >
              Confirmar cancelamento
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  busy,
  variant = 'default',
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy: boolean;
  variant?: 'default' | 'danger';
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={
        'text-xs font-medium px-2 py-1 rounded border transition-colors disabled:opacity-50 ' +
        (variant === 'danger'
          ? 'border-red-300 text-red-700 hover:bg-red-50'
          : 'border-neutral-300 text-brand-black hover:border-brand-cyan hover:text-brand-cyanDark')
      }
    >
      {children}
    </button>
  );
}

function formatTime(d: Date | string): string {
  return new Date(d).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });
}
