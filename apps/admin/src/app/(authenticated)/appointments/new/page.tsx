'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type {
  AppointmentResponse,
  PatientResponse,
  PlanResponse,
  ServiceResponse,
  Slot,
} from '@rpx/shared';
import { ApiError, api } from '@/lib/api';
import { Card } from '@/components/Card';

interface SlotsResponse {
  date: string;
  timezone: string;
  serviceId: string;
  slots: Slot[];
}

export default function NewAppointmentPage() {
  const router = useRouter();

  const [patients, setPatients] = useState<PatientResponse[]>([]);
  const [services, setServices] = useState<ServiceResponse[]>([]);
  const [bootError, setBootError] = useState<string | null>(null);

  const [patientId, setPatientId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const [plans, setPlans] = useState<PlanResponse[] | null>(null);
  const [planId, setPlanId] = useState('');
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // boot: pacientes + serviços ativos
  useEffect(() => {
    (async () => {
      try {
        const [p, s] = await Promise.all([
          api<PatientResponse[]>('/patients'),
          api<ServiceResponse[]>('/services'),
        ]);
        setPatients(p);
        setServices(s);
      } catch (err) {
        setBootError(err instanceof ApiError ? err.message : 'Falha ao carregar dados.');
      }
    })();
  }, []);

  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId],
  );

  // carrega planos do paciente quando paciente muda
  useEffect(() => {
    setPlans(null);
    setPlanId('');
    if (!patientId) return;
    api<PlanResponse[]>(`/patients/${patientId}/plans`)
      .then((list) => setPlans(list))
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Falha ao carregar planos.'),
      );
  }, [patientId]);

  // planos compatíveis com o serviço escolhido
  const eligiblePlans = useMemo(() => {
    if (!plans || !selectedService) return [];
    return plans.filter(
      (p) =>
        p.serviceId === selectedService.id &&
        p.status === 'ACTIVE' &&
        p.type === selectedService.acceptedPlanType,
    );
  }, [plans, selectedService]);

  // auto-seleciona o plano se só houver um
  useEffect(() => {
    if (eligiblePlans.length === 1) setPlanId(eligiblePlans[0]!.id);
    else setPlanId('');
  }, [eligiblePlans]);

  // carrega slots quando serviço + data
  useEffect(() => {
    setSlots(null);
    setSelectedSlot(null);
    if (!serviceId || !date) return;
    api<SlotsResponse>(`/schedules/slots?serviceId=${serviceId}&date=${date}`)
      .then((res) => setSlots(res.slots))
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Falha ao carregar horários.'),
      );
  }, [serviceId, date]);

  async function handleSubmit() {
    if (!patientId || !serviceId || !planId || !selectedSlot) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await api<AppointmentResponse>('/appointments', {
        method: 'POST',
        body: { patientId, serviceId, planId, startsAt: selectedSlot },
      });
      router.replace(`/patients/${created.patientId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao criar agendamento.');
    } finally {
      setSubmitting(false);
    }
  }

  if (bootError) {
    return (
      <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
        {bootError}
      </div>
    );
  }

  const canSubmit = !!patientId && !!serviceId && !!planId && !!selectedSlot && !submitting;

  return (
    <div>
      <div className="mb-6">
        <Link href="/appointments" className="text-sm text-brand-cyanDark hover:underline">
          ← agenda
        </Link>
        <h1 className="text-2xl font-bold text-brand-black mt-1">Novo agendamento</h1>
      </div>

      <div className="space-y-4 max-w-2xl">
        <Card title="1. Paciente e serviço">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Paciente *</label>
              <select
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                className="input"
              >
                <option value="">Selecione…</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Serviço *</label>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="input"
              >
                <option value="">Selecione…</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.durationMinutes}min · {s.acceptedPlanType})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        {patientId && serviceId && (
          <Card title="2. Plano">
            {plans === null ? (
              <div className="text-neutral-400 text-sm">Carregando planos…</div>
            ) : eligiblePlans.length === 0 ? (
              <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                Paciente não tem plano <strong>ativo</strong> compatível com este serviço (
                {selectedService?.acceptedPlanType}). Crie um plano antes de agendar.
              </div>
            ) : (
              <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="input">
                <option value="">Selecione o plano…</option>
                {eligiblePlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.type === 'PACKAGE'
                      ? `Pacote — ${p.remainingSessions ?? 0}/${p.totalSessions ?? 0} sessões`
                      : `Assinatura — ${p.weeklyUsage ?? 0}/${p.weeklyQuota ?? 0} na semana`}
                  </option>
                ))}
              </select>
            )}
          </Card>
        )}

        {serviceId && (
          <Card title="3. Data e horário">
            <div className="mb-4">
              <label className="block text-sm font-medium text-neutral-700 mb-1">Data *</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input max-w-xs"
              />
            </div>
            {slots === null ? (
              <div className="text-neutral-400 text-sm">Carregando horários…</div>
            ) : slots.length === 0 ? (
              <div className="text-sm text-neutral-500">
                Nenhum horário disponível para essa data. Verifique a grade do serviço.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {slots.map((slot) => {
                  const value = new Date(slot.startsAt).toISOString();
                  const active = selectedSlot === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSelectedSlot(value)}
                      className={
                        'px-3 py-1.5 rounded text-sm font-medium border transition-colors ' +
                        (active
                          ? 'bg-brand-cyan text-white border-brand-cyan'
                          : 'bg-white text-brand-black border-neutral-300 hover:border-brand-cyan')
                      }
                    >
                      {slot.localStart}
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Link href="/appointments" className="btn-outline">
            Cancelar
          </Link>
          <button onClick={handleSubmit} disabled={!canSubmit} className="btn-primary">
            {submitting ? 'Agendando…' : 'Confirmar agendamento'}
          </button>
        </div>
      </div>
    </div>
  );
}
