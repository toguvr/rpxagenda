'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  CreateProtocolRequest,
  EquipmentResponse,
  PlanResponse,
  ProfessionalResponse,
  ProtocolResponse,
  ServiceResponse,
} from '@rpx/shared';
import { ApiError, api } from '@/lib/api';
import { Modal } from './Modal';

/**
 * Modal de registro da avaliação clínica (protocolo). O profissional define
 * diagnóstico, plano de tratamento (total de sessões + frequência) e
 * equipamentos sugeridos. Vincula-se a um plano comercial do paciente.
 * O backend exige no máximo 1 protocolo ATIVO por plano.
 */
export function CreateProtocolModal({
  open,
  onClose,
  patientId,
  plans,
  services,
  professionals,
  equipments,
  defaultProfessionalId,
  appointmentId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  patientId: string;
  /** Planos elegíveis (sem protocolo ativo). */
  plans: PlanResponse[];
  services: Map<string, ServiceResponse>;
  professionals: ProfessionalResponse[];
  equipments: EquipmentResponse[];
  defaultProfessionalId: string;
  /** Agendamento de avaliação que originou o protocolo (opcional). */
  appointmentId?: string;
  onCreated: (protocol: ProtocolResponse) => void;
}) {
  const [planId, setPlanId] = useState('');
  const [professionalId, setProfessionalId] = useState(defaultProfessionalId);
  const [diagnosis, setDiagnosis] = useState('');
  const [observations, setObservations] = useState('');
  const [totalSessions, setTotalSessions] = useState(10);
  const [sessionsPerWeek, setSessionsPerWeek] = useState(2);
  const [equipmentIds, setEquipmentIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-sincroniza o profissional padrão quando a lista carrega.
  useEffect(() => {
    if (open) setProfessionalId((prev) => prev || defaultProfessionalId);
  }, [open, defaultProfessionalId]);

  const activeProfessionals = useMemo(() => professionals.filter((p) => p.active), [professionals]);
  const activeEquipments = useMemo(() => equipments.filter((e) => e.active), [equipments]);

  function toggleEquipment(id: string) {
    setEquipmentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      const body: CreateProtocolRequest = {
        patientId,
        professionalId,
        planId: planId || undefined,
        appointmentId: appointmentId ?? undefined,
        totalSessions,
        sessionsPerWeek,
        diagnosis: diagnosis.trim(),
        observations: observations.trim() ? observations.trim() : undefined,
        equipmentIds,
      };
      const created = await api<ProtocolResponse>('/protocols', { method: 'POST', body });
      onCreated(created);
      resetAndClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao registrar avaliação.');
    } finally {
      setBusy(false);
    }
  }

  function resetAndClose() {
    setPlanId('');
    setProfessionalId(defaultProfessionalId);
    setDiagnosis('');
    setObservations('');
    setTotalSessions(10);
    setSessionsPerWeek(2);
    setEquipmentIds([]);
    setError(null);
    onClose();
  }

  const canSubmit =
    !busy &&
    !!professionalId &&
    diagnosis.trim().length >= 3 &&
    totalSessions > 0 &&
    sessionsPerWeek > 0 &&
    sessionsPerWeek <= 14;

  return (
    <Modal open={open} onClose={resetAndClose} title="Registrar avaliação">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Plano (opcional)
          </label>
          <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="input">
            <option value="">— Sem plano (avaliação avulsa) —</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {services.get(p.serviceId)?.name ?? p.serviceId.slice(0, 8)} · {p.type} · {p.status}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Profissional *</label>
          <select
            value={professionalId}
            onChange={(e) => setProfessionalId(e.target.value)}
            className="input"
          >
            <option value="">Selecione…</option>
            {activeProfessionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName} ({p.registry})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Diagnóstico / queixa *
          </label>
          <textarea
            rows={3}
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
            className="input resize-none"
            placeholder="Avaliação clínica, diagnóstico funcional, queixa principal…"
            maxLength={2000}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Observações</label>
          <textarea
            rows={2}
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            className="input resize-none"
            placeholder="Cuidados, contraindicações, metas… (opcional)"
            maxLength={4000}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Total de sessões *
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={totalSessions}
              onChange={(e) => setTotalSessions(Number(e.target.value))}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Sessões / semana *
            </label>
            <input
              type="number"
              min={1}
              max={14}
              value={sessionsPerWeek}
              onChange={(e) => setSessionsPerWeek(Number(e.target.value))}
              className="input"
            />
          </div>
        </div>

        {activeEquipments.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Equipamentos sugeridos
            </label>
            <div className="flex flex-wrap gap-2">
              {activeEquipments.map((e) => {
                const checked = equipmentIds.includes(e.id);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => toggleEquipment(e.id)}
                    className={
                      'rounded-full border px-3 py-1 text-sm transition-colors ' +
                      (checked
                        ? 'border-brand-cyan bg-brand-cyanLight text-brand-cyanDark'
                        : 'border-neutral-300 text-neutral-600 hover:border-brand-cyan')
                    }
                  >
                    {e.name}
                  </button>
                );
              })}
            </div>
          </div>
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
            {busy ? 'Salvando…' : 'Salvar avaliação'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
