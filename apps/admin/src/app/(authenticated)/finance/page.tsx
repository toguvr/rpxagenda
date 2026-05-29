'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ALL_EXPENSE_CATEGORIES,
  ALL_PAYMENT_METHODS,
  ALL_PAYMENT_STATUSES,
  PaymentStatus,
  UserRole,
  type ExpenseResponse,
  type FinanceSummaryResponse,
  type PatientResponse,
  type PaymentResponse,
  type ServiceResponse,
} from '@rpx/shared';
import { ApiError, api } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { formatCents } from '@/lib/money';
import {
  EXPENSE_CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_COLORS,
  PAYMENT_STATUS_LABELS,
} from '@/lib/finance-labels';
import { SearchableSelect } from '@/components/SearchableSelect';
import { RecordPaymentModal } from '@/components/RecordPaymentModal';
import { CreateExpenseModal } from '@/components/CreateExpenseModal';

type Tab = 'payments' | 'expenses';

export default function FinancePage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());

  const [summary, setSummary] = useState<FinanceSummaryResponse | null>(null);
  const [payments, setPayments] = useState<PaymentResponse[]>([]);
  const [expenses, setExpenses] = useState<ExpenseResponse[]>([]);
  const [patients, setPatients] = useState<PatientResponse[]>([]);
  const [services, setServices] = useState<Map<string, ServiceResponse>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>('payments');
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [expModalOpen, setExpModalOpen] = useState(false);

  // filtros das listas
  const [statusFilter, setStatusFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => {
    const ok = getCurrentUser()?.role === UserRole.ADMIN;
    setAllowed(ok);
    if (!ok) router.replace('/dashboard');
  }, [router]);

  const loadSummary = useCallback(async () => {
    const s = await api<FinanceSummaryResponse>(`/finance/summary?from=${from}&to=${to}`);
    setSummary(s);
  }, [from, to]);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    (async () => {
      try {
        const [pays, exps, pats, svcs] = await Promise.all([
          api<PaymentResponse[]>('/payments'),
          api<ExpenseResponse[]>('/expenses'),
          api<PatientResponse[]>('/patients'),
          api<ServiceResponse[]>('/services?includeInactive=true'),
        ]);
        if (cancelled) return;
        setPayments(pays);
        setExpenses(exps);
        setPatients(pats);
        setServices(new Map(svcs.map((s) => [s.id, s])));
      } catch (err) {
        if (!cancelled)
          setError(err instanceof ApiError ? err.message : 'Falha ao carregar dados.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    loadSummary().catch(() => undefined);
  }, [allowed, loadSummary]);

  // Recebimentos exibidos: PAID dentro do período + demais status sempre visíveis.
  const filteredPayments = useMemo(() => {
    return payments
      .filter((p) => {
        if (statusFilter && p.status !== statusFilter) return false;
        if (methodFilter && p.method !== methodFilter) return false;
        if (p.status === PaymentStatus.PAID) {
          const d = p.paidAt ? p.paidAt.toString().slice(0, 10) : '';
          return d >= from && d <= to;
        }
        return true;
      })
      .sort((a, b) => dateKey(b) - dateKey(a));
  }, [payments, statusFilter, methodFilter, from, to]);

  const filteredExpenses = useMemo(() => {
    return expenses
      .filter((e) => {
        if (categoryFilter && e.category !== categoryFilter) return false;
        const d = e.paidAt.toString().slice(0, 10);
        return d >= from && d <= to;
      })
      .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
  }, [expenses, categoryFilter, from, to]);

  async function refreshAfterMutation() {
    await loadSummary().catch(() => undefined);
  }

  async function markPaid(p: PaymentResponse) {
    try {
      const updated = await api<PaymentResponse>(`/payments/${p.id}`, {
        method: 'PATCH',
        body: { status: 'PAID' },
      });
      setPayments((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      await refreshAfterMutation();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao atualizar recebimento.');
    }
  }

  async function deletePayment(p: PaymentResponse) {
    if (!confirm('Remover este recebimento? A ação é auditada.')) return;
    try {
      await api(`/payments/${p.id}`, { method: 'DELETE' });
      setPayments((prev) => prev.filter((x) => x.id !== p.id));
      await refreshAfterMutation();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao remover recebimento.');
    }
  }

  async function deleteExpense(e: ExpenseResponse) {
    if (!confirm('Remover esta despesa? A ação é auditada.')) return;
    try {
      await api(`/expenses/${e.id}`, { method: 'DELETE' });
      setExpenses((prev) => prev.filter((x) => x.id !== e.id));
      await refreshAfterMutation();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao remover despesa.');
    }
  }

  if (allowed === null) {
    return <div className="text-neutral-400">Carregando…</div>;
  }
  if (!allowed) return null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold text-brand-black">Financeiro</h1>
          <p className="text-sm text-neutral-500">Recebimentos, despesas e saldo do período.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setPayModalOpen(true)} className="btn-primary whitespace-nowrap">
            Registrar recebimento
          </button>
          <button onClick={() => setExpModalOpen(true)} className="btn-outline whitespace-nowrap">
            Lançar despesa
          </button>
        </div>
      </div>

      {/* Período */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">De</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">Até</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Recebido" value={formatCents(summary?.receivedCents)} tone="green" />
        <Kpi label="A receber" value={formatCents(summary?.pendingCents)} tone="yellow" />
        <Kpi label="Em atraso" value={formatCents(summary?.overdueCents)} tone="red" />
        <Kpi label="Despesas" value={formatCents(summary?.expensesCents)} tone="neutral" />
        <Kpi
          label="Saldo"
          value={formatCents(summary?.balanceCents)}
          tone={(summary?.balanceCents ?? 0) >= 0 ? 'cyan' : 'red'}
        />
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-neutral-200">
        <TabBtn active={tab === 'payments'} onClick={() => setTab('payments')}>
          Recebimentos
        </TabBtn>
        <TabBtn active={tab === 'expenses'} onClick={() => setTab('expenses')}>
          Despesas
        </TabBtn>
      </div>

      {tab === 'payments' ? (
        <>
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SearchableSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: '', label: 'Todas as situações' },
                ...ALL_PAYMENT_STATUSES.map((s) => ({ value: s, label: PAYMENT_STATUS_LABELS[s] })),
              ]}
            />
            <SearchableSelect
              value={methodFilter}
              onChange={setMethodFilter}
              options={[
                { value: '', label: 'Todas as formas' },
                ...ALL_PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] })),
              ]}
            />
          </div>

          {filteredPayments.length === 0 ? (
            <Empty>Nenhum recebimento no período.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Paciente</th>
                    <th>Descrição</th>
                    <th>Forma</th>
                    <th>Situação</th>
                    <th className="text-right">Valor</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((p) => (
                    <tr key={p.id}>
                      <td>{formatDate(p.paidAt ?? p.dueAt ?? p.createdAt)}</td>
                      <td className="font-medium">
                        {p.patientId ? (
                          <Link
                            href={`/patients/${p.patientId}`}
                            className="hover:text-brand-cyanDark"
                          >
                            {p.patientName ?? 'Paciente'}
                          </Link>
                        ) : (
                          <span className="text-neutral-400">Avulso</span>
                        )}
                      </td>
                      <td className="text-neutral-600">{p.description ?? p.serviceName ?? '—'}</td>
                      <td>{PAYMENT_METHOD_LABELS[p.method]}</td>
                      <td>
                        <span
                          className={
                            'inline-block text-xs px-2 py-0.5 rounded-full font-medium ' +
                            PAYMENT_STATUS_COLORS[p.status]
                          }
                        >
                          {PAYMENT_STATUS_LABELS[p.status]}
                        </span>
                      </td>
                      <td className="text-right font-medium">{formatCents(p.amountCents)}</td>
                      <td>
                        <div className="flex gap-1.5">
                          {p.status === PaymentStatus.PENDING && (
                            <ActionBtn onClick={() => markPaid(p)}>Marcar pago</ActionBtn>
                          )}
                          <ActionBtn variant="danger" onClick={() => deletePayment(p)}>
                            Remover
                          </ActionBtn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SearchableSelect
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                { value: '', label: 'Todas as categorias' },
                ...ALL_EXPENSE_CATEGORIES.map((c) => ({
                  value: c,
                  label: EXPENSE_CATEGORY_LABELS[c],
                })),
              ]}
            />
          </div>

          {filteredExpenses.length === 0 ? (
            <Empty>Nenhuma despesa no período.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Categoria</th>
                    <th>Descrição</th>
                    <th className="text-right">Valor</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map((e) => (
                    <tr key={e.id}>
                      <td>{formatDate(e.paidAt)}</td>
                      <td>{EXPENSE_CATEGORY_LABELS[e.category]}</td>
                      <td className="text-neutral-600">{e.description ?? '—'}</td>
                      <td className="text-right font-medium">{formatCents(e.amountCents)}</td>
                      <td>
                        <ActionBtn variant="danger" onClick={() => deleteExpense(e)}>
                          Remover
                        </ActionBtn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <RecordPaymentModal
        open={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        patients={patients}
        services={services}
        onSaved={(p) => {
          setPayments((prev) => [p, ...prev]);
          refreshAfterMutation();
        }}
      />
      <CreateExpenseModal
        open={expModalOpen}
        onClose={() => setExpModalOpen(false)}
        onSaved={(e) => {
          setExpenses((prev) => [e, ...prev]);
          refreshAfterMutation();
        }}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'green' | 'yellow' | 'red' | 'neutral' | 'cyan';
}) {
  const tones: Record<string, string> = {
    green: 'text-green-700',
    yellow: 'text-yellow-700',
    red: 'text-red-700',
    neutral: 'text-neutral-700',
    cyan: 'text-brand-cyanDark',
  };
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={'mt-1 text-lg font-bold ' + tones[tone]}>{value}</div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ' +
        (active
          ? 'border-brand-cyan text-brand-cyanDark'
          : 'border-transparent text-neutral-500 hover:text-neutral-800')
      }
    >
      {children}
    </button>
  );
}

function ActionBtn({
  children,
  onClick,
  variant = 'default',
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
}) {
  return (
    <button
      onClick={onClick}
      className={
        'text-xs font-medium px-2 py-1 rounded border transition-colors ' +
        (variant === 'danger'
          ? 'border-red-300 text-red-700 hover:bg-red-50'
          : 'border-neutral-300 text-brand-black hover:border-brand-cyan hover:text-brand-cyanDark')
      }
    >
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-neutral-500 bg-white border border-neutral-200 rounded-lg p-8 text-center">
      {children}
    </div>
  );
}

function dateKey(p: PaymentResponse): number {
  const d = p.paidAt ?? p.dueAt ?? p.createdAt;
  return new Date(d).getTime();
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function today(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function monthStart(): string {
  return today().slice(0, 7) + '-01';
}
