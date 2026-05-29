'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type {
  AppointmentResponse,
  EquipmentResponse,
  PatientResponse,
  PlanResponse,
  ProtocolResponse,
  ServiceResponse,
  Slot,
} from '@rpx/shared';
import { ApiError, api } from '@/lib/api';
import { Card } from '@/components/Card';
import { SearchableSelect } from '@/components/SearchableSelect';

interface SlotsResponse {
  date: string;
  timezone: string;
  serviceId: string;
  slots: Slot[];
}

export default function NewAppointmentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [patients, setPatients] = useState<PatientResponse[]>([]);
  const [services, setServices] = useState<ServiceResponse[]>([]);
  const [bootError, setBootError] = useState<string | null>(null);

  const [patientId, setPatientId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const [plans, setPlans] = useState<PlanResponse[] | null>(null);
  const [planId, setPlanId] = useState('');
  const [avulso, setAvulso] = useState(false);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  // equipamentos do serviço + sugestões do protocolo do paciente
  const [serviceEquipments, setServiceEquipments] = useState<EquipmentResponse[]>([]);
  const [protocols, setProtocols] = useState<ProtocolResponse[]>([]);
  const [equipmentIds, setEquipmentIds] = useState<string[]>([]);

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
  const isAvaliacao = selectedService?.type === 'AVALIACAO';

  // Pré-seleção vinda do cadastro de paciente ("Agendar avaliação").
  useEffect(() => {
    const p = searchParams.get('patientId');
    if (p) setPatientId(p);
  }, [searchParams]);
  useEffect(() => {
    if (searchParams.get('eval') === '1' && !serviceId && services.length > 0) {
      const av = services.find((s) => s.type === 'AVALIACAO');
      if (av) setServiceId(av.id);
    }
  }, [searchParams, services, serviceId]);

  // carrega planos + protocolos do paciente quando paciente muda
  useEffect(() => {
    setPlans(null);
    setPlanId('');
    setProtocols([]);
    if (!patientId) return;
    api<PlanResponse[]>(`/patients/${patientId}/plans`)
      .then((list) => setPlans(list))
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Falha ao carregar planos.'),
      );
    api<ProtocolResponse[]>(`/patients/${patientId}/protocols`)
      .then(setProtocols)
      .catch(() => {
        /* protocolo é opcional para agendar */
      });
  }, [patientId]);

  // carrega os equipamentos que o serviço pode usar
  useEffect(() => {
    setServiceEquipments([]);
    if (!serviceId) return;
    api<EquipmentResponse[]>(`/services/${serviceId}/equipments`)
      .then(setServiceEquipments)
      .catch(() => {
        /* serviço pode não ter equipamentos vinculados */
      });
  }, [serviceId]);

  // pré-marca os equipamentos sugeridos pela avaliação (protocolo do plano),
  // limitados aos que o serviço aceita. Admin pode ajustar depois.
  useEffect(() => {
    if (!planId || serviceEquipments.length === 0) {
      setEquipmentIds([]);
      return;
    }
    const proto = protocols.find((p) => p.planId === planId && p.active);
    const svcIds = new Set(serviceEquipments.map((e) => e.id));
    setEquipmentIds((proto?.equipmentIds ?? []).filter((id) => svcIds.has(id)));
  }, [planId, serviceEquipments, protocols]);

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

  // avulso só vale para Avaliação; quando não há plano elegível, assume avulso por padrão
  useEffect(() => {
    if (!isAvaliacao) {
      setAvulso(false);
      return;
    }
    setAvulso(eligiblePlans.length === 0);
  }, [isAvaliacao, eligiblePlans.length]);

  // auto-seleciona o plano se só houver um (ignora quando avulso)
  useEffect(() => {
    if (avulso) {
      setPlanId('');
      return;
    }
    if (eligiblePlans.length === 1) setPlanId(eligiblePlans[0]!.id);
    else setPlanId('');
  }, [eligiblePlans, avulso]);

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

  function toggleEquipment(id: string) {
    setEquipmentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit() {
    if (!patientId || !serviceId || !selectedSlot || (!avulso && !planId)) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await api<AppointmentResponse>('/appointments', {
        method: 'POST',
        body: {
          patientId,
          serviceId,
          startsAt: selectedSlot,
          equipmentIds,
          ...(avulso ? {} : { planId }),
        },
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

  const canSubmit =
    !!patientId && !!serviceId && (avulso || !!planId) && !!selectedSlot && !submitting;

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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Paciente *</label>
              <SearchableSelect
                value={patientId}
                onChange={setPatientId}
                options={[
                  { value: '', label: 'Selecione…' },
                  ...patients.map((p) => ({ value: p.id, label: p.fullName })),
                ]}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Serviço *</label>
              <SearchableSelect
                value={serviceId}
                onChange={setServiceId}
                options={[
                  { value: '', label: 'Selecione…' },
                  ...services.map((s) => ({
                    value: s.id,
                    label: `${s.name} (${s.durationMinutes}min · ${s.acceptedPlanType})`,
                  })),
                ]}
              />
            </div>
          </div>
        </Card>

        {patientId && serviceId && (
          <Card title="2. Plano">
            {isAvaliacao && (
              <label className="mb-3 flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={avulso}
                  onChange={(e) => setAvulso(e.target.checked)}
                />
                Avulso (sem plano) — disponível para Avaliação
              </label>
            )}
            {avulso ? (
              <p className="text-sm text-neutral-500">
                Avaliação avulsa: não consome plano nem sessão.
              </p>
            ) : plans === null ? (
              <div className="text-neutral-400 text-sm">Carregando planos…</div>
            ) : eligiblePlans.length === 0 ? (
              <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                Paciente não tem plano <strong>ativo</strong> compatível com este serviço (
                {selectedService?.acceptedPlanType}).
                {isAvaliacao
                  ? ' Marque “Avulso” acima para agendar a avaliação sem plano.'
                  : ' Crie um plano antes de agendar.'}
              </div>
            ) : (
              <SearchableSelect
                value={planId}
                onChange={setPlanId}
                options={[
                  { value: '', label: 'Selecione o plano…' },
                  ...eligiblePlans.map((p) => ({
                    value: p.id,
                    label:
                      p.type === 'PACKAGE'
                        ? `Pacote — ${p.remainingSessions ?? 0}/${p.totalSessions ?? 0} sessões`
                        : `Assinatura — ${p.weeklyUsage ?? 0}/${p.weeklyQuota ?? 0} na semana`,
                  })),
                ]}
              />
            )}
          </Card>
        )}

        {serviceId && serviceEquipments.length > 0 && (
          <Card title="3. Equipamentos">
            <p className="text-sm text-neutral-500 mb-3">
              Equipamentos exigidos por esta sessão. Os sugeridos pela avaliação do paciente já vêm
              marcados — o horário é bloqueado se algum estiver esgotado.
            </p>
            <div className="flex flex-wrap gap-2">
              {serviceEquipments
                .filter((e) => e.active)
                .map((e) => {
                  const on = equipmentIds.includes(e.id);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => toggleEquipment(e.id)}
                      className={
                        'rounded-full border px-3 py-1.5 text-sm transition-colors ' +
                        (on
                          ? 'border-brand-cyan bg-brand-cyanLight text-brand-cyanDark'
                          : 'border-neutral-300 text-neutral-600 hover:border-brand-cyan')
                      }
                    >
                      {e.name} ({e.totalQuantity})
                    </button>
                  );
                })}
            </div>
          </Card>
        )}

        {serviceId && (
          <Card title="4. Data e horário">
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
