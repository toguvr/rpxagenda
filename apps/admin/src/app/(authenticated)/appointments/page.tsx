'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DatesSetArg, EventClickArg, EventDropArg, EventInput } from '@fullcalendar/core';
import ptBrLocale from '@fullcalendar/core/locales/pt-br';
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

const STATUS_CHIP: Record<string, string> = {
  SCHEDULED: 'bg-neutral-100 text-neutral-700',
  CONFIRMED: 'bg-blue-50 text-blue-700',
  CHECKED_IN: 'bg-brand-cyanLight text-brand-cyanDark',
  COMPLETED: 'bg-green-50 text-green-700',
  CANCELLED: 'bg-neutral-100 text-neutral-500',
  NO_SHOW: 'bg-red-50 text-red-700',
};

// Cores do evento no calendário, por status (fundo / borda / texto).
const STATUS_EVENT: Record<string, { bg: string; border: string; text: string }> = {
  SCHEDULED: { bg: '#f5f5f5', border: '#d4d4d4', text: '#404040' },
  CONFIRMED: { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8' },
  CHECKED_IN: { bg: '#cffafe', border: '#22d3ee', text: '#0e7490' },
  COMPLETED: { bg: '#f0fdf4', border: '#86efac', text: '#15803d' },
  CANCELLED: { bg: '#fafafa', border: '#e5e5e5', text: '#a3a3a3' },
  NO_SHOW: { bg: '#fef2f2', border: '#fca5a5', text: '#b91c1c' },
};

const MOVABLE = new Set(['SCHEDULED', 'CONFIRMED']);
// Falhas de capacidade (§4.3) que o admin pode forçar com aviso.
const FORCEABLE_CODES = new Set([
  'SLOT_FULL',
  'EQUIPMENT_UNAVAILABLE',
  'PATIENT_CONFLICT',
  'LEAD_TIME_VIOLATION',
]);

interface ForcePrompt {
  appt: AppointmentResponse;
  newStart: Date;
  message: string;
  revert: () => void;
}

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<AppointmentResponse[]>([]);
  const [patients, setPatients] = useState<Map<string, PatientResponse>>(new Map());
  const [services, setServices] = useState<Map<string, ServiceResponse>>(new Map());
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [calHeight, setCalHeight] = useState(700);

  // modais
  const [detail, setDetail] = useState<AppointmentResponse | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AppointmentResponse | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [forcePrompt, setForcePrompt] = useState<ForcePrompt | null>(null);

  useEffect(() => {
    const update = () => setCalHeight(Math.max(480, window.innerHeight - 220));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

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

  const reload = useCallback(async () => {
    if (!range) return;
    setLoading(true);
    setError(null);
    try {
      const list = await api<AppointmentResponse[]>(
        `/appointments?fromDate=${range.from}&toDate=${range.to}`,
      );
      setAppointments(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao buscar agendamentos.');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    reload();
  }, [reload]);

  const events = useMemo<EventInput[]>(
    () =>
      appointments.map((a) => {
        const style = STATUS_EVENT[a.status] ?? STATUS_EVENT.SCHEDULED;
        const patient = patients.get(a.patientId);
        const service = services.get(a.serviceId);
        return {
          id: a.id,
          title: `${patient?.fullName ?? 'Paciente'} · ${service?.name ?? 'Serviço'}`,
          start: a.startsAt,
          end: a.endsAt,
          editable: MOVABLE.has(a.status),
          backgroundColor: style.bg,
          borderColor: style.border,
          textColor: style.text,
          extendedProps: { appt: a },
        };
      }),
    [appointments, patients, services],
  );

  function handleDatesSet(arg: DatesSetArg) {
    const from = arg.start.toISOString();
    const to = arg.end.toISOString();
    setRange((prev) => (prev?.from === from && prev?.to === to ? prev : { from, to }));
  }

  function handleEventClick(arg: EventClickArg) {
    const appt = arg.event.extendedProps.appt as AppointmentResponse;
    setActionError(null);
    setDetail(appt);
  }

  async function rescheduleAppt(id: string, startsAt: Date, force: boolean) {
    return api(`/appointments/${id}/reschedule`, {
      method: 'PATCH',
      body: { startsAt: startsAt.toISOString(), force },
    });
  }

  async function handleEventDrop(arg: EventDropArg) {
    const appt = arg.event.extendedProps.appt as AppointmentResponse;
    const newStart = arg.event.start;
    if (!newStart) {
      arg.revert();
      return;
    }
    setActionError(null);
    try {
      await rescheduleAppt(appt.id, newStart, false);
      await reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && FORCEABLE_CODES.has(err.code)) {
        setForcePrompt({ appt, newStart, message: err.message, revert: arg.revert });
      } else {
        setActionError(err instanceof ApiError ? err.message : 'Falha ao remarcar.');
        arg.revert();
      }
    }
  }

  async function confirmForce() {
    if (!forcePrompt) return;
    const { appt, newStart } = forcePrompt;
    setForcePrompt(null);
    try {
      await rescheduleAppt(appt.id, newStart, true);
      await reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Falha ao remarcar.');
      await reload();
    }
  }

  function dismissForce() {
    if (!forcePrompt) return;
    forcePrompt.revert();
    setForcePrompt(null);
  }

  async function runAction(id: string, path: string, body?: unknown) {
    setBusyId(id);
    setActionError(null);
    try {
      await api(`/appointments/${id}/${path}`, { method: 'POST', body });
      setDetail(null);
      await reload();
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

  const detailPatient = detail ? patients.get(detail.patientId) : undefined;
  const detailService = detail ? services.get(detail.serviceId) : undefined;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold text-brand-black">Agenda</h1>
          <p className="text-sm text-neutral-500">
            {loading ? 'Carregando…' : 'Arraste um agendamento para remarcar o horário'}
          </p>
        </div>
        <Link href="/appointments/new" className="btn-primary whitespace-nowrap text-center">
          Novo agendamento
        </Link>
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

      <div className="rounded-lg border border-neutral-200 bg-white p-2 sm:p-4">
        <FullCalendar
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          locale={ptBrLocale}
          firstDay={1}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'timeGridWeek,timeGridDay',
          }}
          height={calHeight}
          slotMinTime="06:00:00"
          slotMaxTime="21:00:00"
          slotDuration="00:30:00"
          snapDuration="00:15:00"
          allDaySlot={false}
          nowIndicator
          expandRows
          editable
          eventDurationEditable={false}
          eventStartEditable
          events={events}
          datesSet={handleDatesSet}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        />
      </div>

      {/* Detalhe + ações */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Detalhes do agendamento">
        {detail && (
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="text-lg font-semibold text-brand-black">
                {detailPatient ? (
                  <Link
                    href={`/patients/${detailPatient.id}`}
                    className="hover:text-brand-cyanDark"
                  >
                    {detailPatient.fullName}
                  </Link>
                ) : (
                  'Paciente'
                )}
              </div>
              <div className="text-sm text-neutral-600">
                {detailService?.name ?? detail.serviceId.slice(0, 8) + '…'}
              </div>
              <div className="text-sm text-neutral-600">
                {formatDateTime(detail.startsAt)} — {formatTime(detail.endsAt)}
              </div>
              <span
                className={
                  'mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ' +
                  (STATUS_CHIP[detail.status] ?? 'bg-neutral-100 text-neutral-700')
                }
              >
                {STATUS_LABELS[detail.status] ?? detail.status}
              </span>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
              {detail.status === 'SCHEDULED' && (
                <ActionBtn
                  busy={busyId === detail.id}
                  onClick={() => runAction(detail.id, 'confirm')}
                >
                  Confirmar
                </ActionBtn>
              )}
              {(detail.status === 'SCHEDULED' || detail.status === 'CONFIRMED') && (
                <ActionBtn
                  busy={busyId === detail.id}
                  onClick={() => runAction(detail.id, 'check-in')}
                >
                  Check-in
                </ActionBtn>
              )}
              {detail.status === 'CHECKED_IN' && (
                <ActionBtn
                  busy={busyId === detail.id}
                  onClick={() => runAction(detail.id, 'complete')}
                >
                  Concluir
                </ActionBtn>
              )}
              {(detail.status === 'SCHEDULED' || detail.status === 'CONFIRMED') && (
                <ActionBtn
                  busy={busyId === detail.id}
                  variant="danger"
                  onClick={() => {
                    setCancelReason('');
                    setCancelTarget(detail);
                    setDetail(null);
                  }}
                >
                  Cancelar
                </ActionBtn>
              )}
              {['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(detail.status) && (
                <span className="text-sm text-neutral-400">Sem ações disponíveis.</span>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Aviso de remarcação forçada */}
      <Modal open={!!forcePrompt} onClose={dismissForce} title="Capacidade excedida">
        {forcePrompt && (
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">
              {forcePrompt.message} Deseja remarcar mesmo assim? A remarcação forçada será
              registrada na auditoria.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={dismissForce} className="btn-outline">
                Voltar
              </button>
              <button
                onClick={confirmForce}
                className="rounded bg-amber-600 px-4 py-2 font-medium text-white transition-colors hover:bg-amber-700"
              >
                Forçar remarcação
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Cancelamento */}
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
        'text-sm font-medium px-3 py-1.5 rounded border transition-colors disabled:opacity-50 ' +
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

function formatDateTime(d: Date | string): string {
  return new Date(d).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
