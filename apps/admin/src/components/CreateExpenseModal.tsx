'use client';

import { useEffect, useState } from 'react';
import {
  ALL_EXPENSE_CATEGORIES,
  ExpenseCategory,
  type CreateExpenseRequest,
  type ExpenseResponse,
} from '@rpx/shared';
import { ApiError, api } from '@/lib/api';
import { reaisToCents } from '@/lib/money';
import { EXPENSE_CATEGORY_LABELS } from '@/lib/finance-labels';
import { Modal } from './Modal';
import { SearchableSelect } from './SearchableSelect';

/** Lança uma despesa (saída). Auditada no backend. */
export function CreateExpenseModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (expense: ExpenseResponse) => void;
}) {
  const [category, setCategory] = useState<ExpenseCategory>(ExpenseCategory.OTHER);
  const [amountReais, setAmountReais] = useState('');
  const [paidAt, setPaidAt] = useState(today());
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCategory(ExpenseCategory.OTHER);
      setAmountReais('');
      setPaidAt(today());
      setDescription('');
      setError(null);
    }
  }, [open]);

  const canSubmit = !busy && reaisToCents(amountReais) > 0 && !!paidAt;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body: CreateExpenseRequest = {
        category,
        amountCents: reaisToCents(amountReais),
        paidAt: new Date(paidAt),
        description: description.trim() || undefined,
      };
      const saved = await api<ExpenseResponse>('/expenses', { method: 'POST', body });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao lançar despesa.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Lançar despesa">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Categoria *</label>
          <SearchableSelect
            value={category}
            onChange={(v) => setCategory(v as ExpenseCategory)}
            options={ALL_EXPENSE_CATEGORIES.map((c) => ({
              value: c,
              label: EXPENSE_CATEGORY_LABELS[c],
            }))}
          />
        </div>

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
            <label className="block text-sm font-medium text-neutral-700 mb-1">Data *</label>
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="input"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Descrição</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
            placeholder="Ex: aluguel maio, compra de macas…"
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
            {busy ? 'Salvando…' : 'Salvar despesa'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function today(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}
