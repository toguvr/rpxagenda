'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ALL_PAYMENT_METHODS,
  ALL_PAYMENT_STATUSES,
  PaymentMethod,
  PaymentStatus,
  type CreatePaymentRequest,
  type PatientResponse,
  type PaymentResponse,
  type PlanResponse,
  type ServiceResponse,
} from '@rpx/shared';
import { ApiError, api } from '@/lib/api';
import { reaisToCents } from '@/lib/money';
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from '@/lib/finance-labels';
import { Modal } from './Modal';
import { SearchableSelect } from './SearchableSelect';

/**
 * Lança um recebimento (entrada). Pode vincular a um plano do paciente
 * (pré-preenche o valor pelo preço do plano) ou ser avulso. Cobrança Pagar.me
 * automática virá na Fase 6 — aqui o lançamento é manual.
 */
export function RecordPaymentModal({
  open,
  onClose,
  patients,
  services,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  patients: PatientResponse[];
  services: Map<string, ServiceResponse>;
  onSaved: (payment: PaymentResponse) => void;
}) {
  const [patientId, setPatientId] = useState('');
  const [plans, setPlans] = useState<PlanResponse[]>([]);
  const [planId, setPlanId] = useState('');
  const [amountReais, setAmountReais] = useState('');
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.PIX);
  const [status, setStatus] = useState<PaymentStatus>(PaymentStatus.PAID);
  const [paidAt, setPaidAt] = useState(today());
  const [dueAt, setDueAt] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPatientId('');
      setPlans([]);
      setPlanId('');
      setAmountReais('');
      setMethod(PaymentMethod.PIX);
      setStatus(PaymentStatus.PAID);
      setPaidAt(today());
      setDueAt('');
      setDescription('');
      setError(null);
    }
  }, [open]);

  // Carrega os planos do paciente selecionado para permitir vínculo + prefill de valor.
  useEffect(() => {
    let cancelled = false;
    if (!patientId) {
      setPlans([]);
      setPlanId('');
      return;
    }
    api<PlanResponse[]>(`/patients/${patientId}/plans`)
      .then((rows) => {
        if (!cancelled) setPlans(rows);
      })
      .catch(() => {
        if (!cancelled) setPlans([]);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  function onSelectPlan(id: string) {
    setPlanId(id);
    const plan = plans.find((p) => p.id === id);
    if (plan?.priceCents != null && !amountReais) {
      setAmountReais(String(plan.priceCents / 100));
    }
  }

  const patientOptions = useMemo(
    () => [
      { value: '', label: '— Recebimento avulso (sem paciente) —' },
      ...patients
        .slice()
        .sort((a, b) => a.fullName.localeCompare(b.fullName))
        .map((p) => ({ value: p.id, label: p.fullName })),
    ],
    [patients],
  );

  const canSubmit = !busy && reaisToCents(amountReais) > 0;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body: CreatePaymentRequest = {
        planId: planId || undefined,
        patientId: patientId || undefined,
        amountCents: reaisToCents(amountReais),
        method,
        status,
        paidAt: status === PaymentStatus.PAID && paidAt ? new Date(paidAt) : undefined,
        dueAt: status === PaymentStatus.PENDING && dueAt ? new Date(dueAt) : undefined,
        description: description.trim() || undefined,
      };
      const saved = await api<PaymentResponse>('/payments', { method: 'POST', body });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao registrar recebimento.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar recebimento">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Paciente</label>
          <SearchableSelect value={patientId} onChange={setPatientId} options={patientOptions} />
        </div>

        {patientId && plans.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Plano (opcional — preenche o valor)
            </label>
            <SearchableSelect
              value={planId}
              onChange={onSelectPlan}
              options={[
                { value: '', label: '— Sem vínculo de plano —' },
                ...plans.map((p) => ({
                  value: p.id,
                  label: `${services.get(p.serviceId)?.name ?? p.serviceId.slice(0, 8)} · ${p.type} · ${p.status}`,
                })),
              ]}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Valor (R$) *</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={amountReais}
              onChange={(e) => setAmountReais(e.target.value)}
              placeholder="0,00"
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Forma *</label>
            <SearchableSelect
              value={method}
              onChange={(v) => setMethod(v as PaymentMethod)}
              options={ALL_PAYMENT_METHODS.map((m) => ({
                value: m,
                label: PAYMENT_METHOD_LABELS[m],
              }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Situação *</label>
            <SearchableSelect
              value={status}
              onChange={(v) => setStatus(v as PaymentStatus)}
              options={ALL_PAYMENT_STATUSES.map((s) => ({
                value: s,
                label: PAYMENT_STATUS_LABELS[s],
              }))}
            />
          </div>
          {status === PaymentStatus.PAID ? (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Recebido em</label>
              <input
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                className="input"
              />
            </div>
          ) : status === PaymentStatus.PENDING ? (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Vencimento</label>
              <input
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="input"
              />
            </div>
          ) : (
            <div />
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Descrição</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
            placeholder="Ex: entrada do pacote, parcela 1/3…"
            className="input"
          />
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-outline">
            Cancelar
          </button>
          <button onClick={submit} disabled={!canSubmit} className="btn-primary">
            {busy ? 'Salvando…' : 'Salvar recebimento'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function today(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}
