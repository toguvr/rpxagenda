'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AppointmentResponse, PatientResponse, ServiceResponse } from '@rpx/shared';
import { ApiError, api } from '@/lib/api';

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

  useEffect(() => {
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

  const sorted = useMemo(
    () =>
      appointments
        ?.slice()
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [appointments],
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-black">Agenda</h1>
          <p className="text-sm text-neutral-500">
            {appointments
              ? `${appointments.length} agendamento${appointments.length !== 1 ? 's' : ''}`
              : 'Carregando…'}
          </p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input max-w-xs"
        />
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
          {error}
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
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => {
              const p = patients.get(a.patientId);
              const s = services.get(a.serviceId);
              const start = new Date(a.startsAt);
              const end = new Date(a.endsAt);
              return (
                <tr key={a.id}>
                  <td className="font-mono text-xs">
                    {formatTime(start)} — {formatTime(end)}
                  </td>
                  <td className="font-medium">{p?.fullName ?? a.patientId.slice(0, 8) + '…'}</td>
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
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });
}
