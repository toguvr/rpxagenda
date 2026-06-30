'use client';

import { useEffect, useState } from 'react';
import {
  ALL_EXPENSE_CATEGORIES,
  ExpenseCategory,
  type CreateRecurringExpenseRequest,
  type RecurringExpenseResponse,
} from '@rpx/shared';
import { ApiError, api } from '@/lib/api';
import { centsToReais, reaisToCents } from '@/lib/money';
import { EXPENSE_CATEGORY_LABELS } from '@/lib/finance-labels';
import { Modal } from './Modal';
import { SearchableSelect } from './SearchableSelect';

/**
 * Cria/edita um gasto fixo (despesa recorrente). O backend materializa a
 * despesa de cada mês automaticamente no dia escolhido.
 */
export function RecurringExpenseModal({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial?: RecurringExpenseResponse | null;
  onClose: () => void;
  onSaved: (rec: RecurringExpenseResponse) => void;
}) {
  const editing = !!initial;
  const [category, setCategory] = useState<ExpenseCategory>(ExpenseCategory.RENT);
  const [amountReais, setAmountReais] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState('5');
  const [variableAmount, setVariableAmount] = useState(false);
  const [active, setActive] = useState(true);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCategory((initial?.category as ExpenseCategory) ?? ExpenseCategory.RENT);
    setAmountReais(initial ? String(centsToReais(initial.amountCents)) : '');
    setDayOfMonth(initial ? String(initial.dayOfMonth) : '5');
    setVariableAmount(initial?.variableAmount ?? false);
    setActive(initial?.active ?? true);
    setDescription(initial?.description ?? '');
    setError(null);
  }, [open, initial]);

  const day = Number(dayOfMonth);
  const canSubmit =
    !busy && reaisToCents(amountReais) > 0 && Number.isInteger(day) && day >= 1 && day <= 28;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body: CreateRecurringExpenseRequest = {
        category,
        amountCents: reaisToCents(amountReais),
        dayOfMonth: day,
        variableAmount,
        active,
        description: description.trim() || undefined,
      };
      const saved = editing
        ? await api<RecurringExpenseResponse>(`/recurring-expenses/${initial!.id}`, {
            method: 'PATCH',
            body,
          })
        : await api<RecurringExpenseResponse>('/recurring-expenses', { method: 'POST', body });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar gasto fixo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar gasto fixo' : 'Novo gasto fixo'}>
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
            <label className="block text-sm font-medium text-neutral-700 mb-1">Dia do mês *</label>
            <input
              type="number"
              min={1}
              max={28}
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(e.target.value)}
              className="input"
            />
            <p className="mt-1 text-xs text-neutral-500">1 a 28 (vale em todos os meses).</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Descrição</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
            placeholder="Ex: aluguel da sala, salário recepção, internet…"
            className="input"
          />
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={variableAmount}
            onChange={(e) => setVariableAmount(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-brand-cyan"
          />
          <span>
            Valor variável (ex: conta de luz). O valor acima é usado como padrão; ajuste a despesa
            gerada quando o valor do mês chegar.
          </span>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 accent-brand-cyan"
          />
          <span className="font-medium text-neutral-700">Ativo (gera despesa todo mês)</span>
        </label>

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
            {busy ? 'Salvando…' : editing ? 'Salvar' : 'Criar gasto fixo'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
