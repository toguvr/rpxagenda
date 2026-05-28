'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { DashboardSummary } from '@rpx/shared';
import { ApiError, api } from '@/lib/api';
import { Card } from '@/components/Card';

export default function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<DashboardSummary>('/dashboard/summary')
      .then(setData)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Falha ao carregar indicadores.'),
      );
  }, []);

  if (error) {
    return (
      <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
        {error}
      </div>
    );
  }
  if (!data) return <div className="text-neutral-400">Carregando indicadores…</div>;

  const { today, patients, plans, attendance30d, last7Days, byService, alerts } = data;
  const pending = plans.pendingPayment + plans.pastDue;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-black">Painel</h1>
        <p className="text-sm text-neutral-500">Visão geral da clínica</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Agendamentos hoje"
          value={today.total}
          hint={`${today.completed} concluídos · ${today.checkedIn} em atendimento`}
        />
        <Kpi
          label="Pacientes com plano ativo"
          value={patients.withActivePlan}
          hint={`${patients.total} no total · +${patients.newThisMonth} no mês`}
        />
        <Kpi
          label="Planos ativos"
          value={plans.active}
          hint={
            pending > 0
              ? `${pending} aguardando/atrasado`
              : `${plans.expiringSoon} expiram em 30 dias`
          }
          tone={pending > 0 ? 'warning' : 'default'}
        />
        <Kpi
          label="Comparecimento (30d)"
          value={`${Math.round(attendance30d.rate * 100)}%`}
          hint={`${attendance30d.completed} concluídas · ${attendance30d.noShow} faltas`}
          tone={
            attendance30d.rate < 0.7 && attendance30d.completed + attendance30d.noShow > 0
              ? 'warning'
              : 'default'
          }
        />
      </div>

      {/* Hoje por status */}
      <Card title="Hoje por status">
        <div className="flex flex-wrap gap-2">
          <StatChip label="Agendados" value={today.scheduled} />
          <StatChip label="Confirmados" value={today.confirmed} tone="blue" />
          <StatChip label="Em atendimento" value={today.checkedIn} tone="cyan" />
          <StatChip label="Concluídos" value={today.completed} tone="green" />
          <StatChip label="Faltas" value={today.noShow} tone="red" />
          <StatChip label="Cancelados" value={today.cancelled} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Últimos 7 dias */}
        <Card title="Agendamentos — últimos 7 dias">
          <BarsByDay data={last7Days} />
        </Card>

        {/* Por serviço (mês) */}
        <Card title="Por serviço — este mês">
          {byService.length === 0 ? (
            <p className="text-sm text-neutral-400">Sem agendamentos no mês.</p>
          ) : (
            <div className="space-y-2.5">
              {byService.map((s) => (
                <BarRow
                  key={s.service}
                  label={s.service}
                  value={s.count}
                  max={byService[0].count}
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={`Planos expirando (${alerts.expiringPlans.length})`}>
          {alerts.expiringPlans.length === 0 ? (
            <p className="text-sm text-neutral-400">Nenhum pacote expira nos próximos 30 dias.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {alerts.expiringPlans.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/patients/${p.patientId}`}
                    className="-mx-2 flex items-center justify-between gap-3 rounded px-2 py-2 text-sm hover:bg-neutral-50"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-brand-black">{p.patientName}</div>
                      <div className="text-xs text-neutral-500">{p.serviceName}</div>
                    </div>
                    <div className="whitespace-nowrap text-right">
                      <div className="text-amber-700">{formatDate(p.validUntil)}</div>
                      {p.remainingSessions != null && (
                        <div className="text-xs text-neutral-500">
                          {p.remainingSessions} restantes
                        </div>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Pacotes acabando (${alerts.lowBalancePlans.length})`}>
          {alerts.lowBalancePlans.length === 0 ? (
            <p className="text-sm text-neutral-400">Nenhum pacote com saldo baixo.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {alerts.lowBalancePlans.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/patients/${p.patientId}`}
                    className="-mx-2 flex items-center justify-between gap-3 rounded px-2 py-2 text-sm hover:bg-neutral-50"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-brand-black">{p.patientName}</div>
                      <div className="text-xs text-neutral-500">{p.serviceName}</div>
                    </div>
                    <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      {p.remainingSessions} sessões
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'default' | 'warning';
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <div className="text-sm text-neutral-500">{label}</div>
      <div
        className={
          'mt-1 text-3xl font-bold ' + (tone === 'warning' ? 'text-amber-600' : 'text-brand-black')
        }
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-neutral-400">{hint}</div>}
    </div>
  );
}

const CHIP_TONES: Record<string, string> = {
  default: 'bg-neutral-100 text-neutral-700',
  blue: 'bg-blue-50 text-blue-700',
  cyan: 'bg-brand-cyanLight text-brand-cyanDark',
  green: 'bg-green-50 text-green-700',
  red: 'bg-red-50 text-red-700',
};

function StatChip({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: keyof typeof CHIP_TONES | string;
}) {
  return (
    <div className={`rounded-lg px-3 py-2 ${CHIP_TONES[tone] ?? CHIP_TONES.default}`}>
      <span className="text-lg font-bold">{value}</span>
      <span className="ml-1.5 text-xs font-medium opacity-80">{label}</span>
    </div>
  );
}

function BarsByDay({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex h-40 items-end gap-2">
      {data.map((d) => {
        const pct = Math.round((d.count / max) * 100);
        return (
          <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
            <div className="text-xs font-medium text-neutral-600">{d.count}</div>
            <div className="flex w-full flex-1 items-end">
              <div
                className="w-full rounded-t bg-brand-cyan"
                style={{ height: `${Math.max(pct, 4)}%` }}
              />
            </div>
            <div className="text-[11px] text-neutral-400">{weekday(d.date)}</div>
          </div>
        );
      })}
    </div>
  );
}

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.round((value / Math.max(1, max)) * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-neutral-700">{label}</span>
        <span className="font-medium text-brand-black">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
        <div className="h-full rounded-full bg-brand-cyan" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function weekday(date: string): string {
  return new Date(`${date}T12:00:00`)
    .toLocaleDateString('pt-BR', { weekday: 'short' })
    .replace('.', '');
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}
