'use client';

import { useEffect, useMemo, useState } from 'react';
import type { MedicalRecordResponse, ProfessionalResponse } from '@rpx/shared';
import { ApiError, api } from '@/lib/api';
import { Modal } from './Modal';
import { SearchableSelect } from './SearchableSelect';

/**
 * Registra/edita a evolução de uma sessão (prontuário). Cria via POST /medical-records
 * (PROFESSIONAL grava como ele mesmo; ADMIN escolhe o profissional autor) e edita via PATCH.
 */
export function MedicalRecordModal({
  open,
  onClose,
  patientId,
  professionals,
  defaultProfessionalId,
  appointmentId,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  patientId: string;
  professionals: ProfessionalResponse[];
  defaultProfessionalId: string;
  /** Agendamento da sessão (vincula a evolução), quando aplicável. */
  appointmentId?: string;
  /** Registro existente = modo edição. */
  editing?: MedicalRecordResponse | null;
  onSaved: (record: MedicalRecordResponse) => void;
}) {
  const isEdit = !!editing;
  const [professionalId, setProfessionalId] = useState(defaultProfessionalId);
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setProfessionalId(editing ? editing.professionalId : defaultProfessionalId);
      setContent(editing?.content ?? '');
      setError(null);
    }
  }, [open, editing, defaultProfessionalId]);

  const activeProfs = useMemo(() => professionals.filter((p) => p.active), [professionals]);
  const canSubmit = !busy && content.trim().length > 0 && (isEdit || !!professionalId);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const saved = isEdit
        ? await api<MedicalRecordResponse>(`/medical-records/${editing!.id}`, {
            method: 'PATCH',
            body: { content: content.trim() },
          })
        : await api<MedicalRecordResponse>('/medical-records', {
            method: 'POST',
            body: {
              patientId,
              professionalId,
              content: content.trim(),
              ...(appointmentId ? { appointmentId } : {}),
            },
          });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar evolução.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar evolução' : 'Registrar evolução'}>
      <div className="space-y-4">
        {appointmentId && !isEdit && (
          <p className="text-xs text-neutral-500">Vinculada ao agendamento selecionado.</p>
        )}

        {!isEdit && (
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Profissional *
            </label>
            <SearchableSelect
              value={professionalId}
              onChange={setProfessionalId}
              options={[
                { value: '', label: 'Selecione…' },
                ...activeProfs.map((p) => ({
                  value: p.id,
                  label: `${p.fullName} (${p.registry})`,
                })),
              ]}
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            O que foi feito *
          </label>
          <textarea
            rows={6}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={20_000}
            placeholder="Evolução da sessão: condutas realizadas, exercícios, resposta do paciente, observações…"
            className="input resize-none"
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
            {busy ? 'Salvando…' : 'Salvar evolução'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
