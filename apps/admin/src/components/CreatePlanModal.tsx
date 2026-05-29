'use client';

import { useMemo, useState } from 'react';
import type { PatientResponse, PlanResponse, ServiceResponse } from '@rpx/shared';
import { ApiError, api } from '@/lib/api';
import { Modal } from './Modal';
import { SearchableSelect } from './SearchableSelect';

/**
 * Modal de criação de plano. O tipo do plano é derivado do serviço escolhido
 * (`acceptedPlanType`) — o admin não escolhe o tipo diretamente, evitando o erro
 * de criar PACKAGE para um serviço SUBSCRIPTION.
 *
 * Uso na ficha do paciente: passa `patientId` (sem seletor de paciente).
 * Uso na tela de planos: passa `patients` (mostra o seletor de paciente).
 */
export function CreatePlanModal({
  open,
  onClose,
  patientId,
  patients,
  services,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  patientId?: string;
  patients?: PatientResponse[];
  services: ServiceResponse[];
  onCreated: (plan: PlanResponse) => void;
}) {
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [totalSessions, setTotalSessions] = useState(20);
  const [validUntil, setValidUntil] = useState('');
  const [weeklyQuota, setWeeklyQuota] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const effectivePatientId = patientId ?? selectedPatientId;
  const showPatientPicker = !patientId;

  const service = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId],
  );
  const planType = service?.acceptedPlanType ?? null;

  async function handleSubmit() {
    if (!service || !effectivePatientId) return;
    setBusy(true);
    setError(null);
    try {
      const body =
        planType === 'PACKAGE'
          ? {
              type: 'PACKAGE' as const,
              patientId: effectivePatientId,
              serviceId,
              totalSessions,
              validUntil,
            }
          : {
              type: 'SUBSCRIPTION' as const,
              patientId: effectivePatientId,
              serviceId,
              weeklyQuota,
            };
      const created = await api<PlanResponse>('/plans', { method: 'POST', body });
      onCreated(created);
      resetAndClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao criar plano.');
    } finally {
      setBusy(false);
    }
  }

  function resetAndClose() {
    setSelectedPatientId('');
    setServiceId('');
    setTotalSessions(20);
    setValidUntil('');
    setWeeklyQuota(3);
    setError(null);
    onClose();
  }

  const canSubmit =
    !!service &&
    !!effectivePatientId &&
    !busy &&
    (planType === 'SUBSCRIPTION' ? weeklyQuota > 0 : totalSessions > 0 && !!validUntil);

  return (
    <Modal open={open} onClose={resetAndClose} title="Criar plano">
      <div className="space-y-4">
        {showPatientPicker && (
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Paciente *</label>
            <SearchableSelect
              value={selectedPatientId}
              onChange={setSelectedPatientId}
              options={[
                { value: '', label: 'Selecione…' },
                ...(patients ?? [])
                  .slice()
                  .sort((a, b) => a.fullName.localeCompare(b.fullName))
                  .map((p) => ({ value: p.id, label: p.fullName })),
              ]}
            />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Serviço *</label>
          <SearchableSelect
            value={serviceId}
            onChange={setServiceId}
            options={[
              { value: '', label: 'Selecione…' },
              ...services
                .filter((s) => s.active)
                .map((s) => ({ value: s.id, label: `${s.name} (${s.acceptedPlanType})` })),
            ]}
          />
        </div>

        {planType === 'PACKAGE' && (
          <>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Total de sessões *
              </label>
              <input
                type="number"
                min={1}
                value={totalSessions}
                onChange={(e) => setTotalSessions(Number(e.target.value))}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Válido até *
              </label>
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="input"
              />
            </div>
          </>
        )}

        {planType === 'SUBSCRIPTION' && (
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Agendamentos por semana *
            </label>
            <input
              type="number"
              min={1}
              max={14}
              value={weeklyQuota}
              onChange={(e) => setWeeklyQuota(Number(e.target.value))}
              className="input"
            />
          </div>
        )}

        {service && (
          <p className="text-xs text-neutral-500">
            Tipo do plano: <strong>{planType}</strong> (definido pelo serviço). O plano é criado já
            como <strong>ACTIVE</strong> — cobrança Pagar.me virá na Fase 6.
          </p>
        )}

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={resetAndClose} className="btn-outline">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={!canSubmit} className="btn-primary">
            {busy ? 'Criando…' : 'Criar plano'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
