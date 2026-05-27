import { useQuery } from '@tanstack/react-query';
import { ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PlanResponse, ServiceResponse } from '@rpx/shared';
import { api } from '@/lib/api';
import {
  Badge,
  Card,
  EmptyState,
  LoadingState,
  Screen,
  ScreenHeader,
  type Tone,
} from '@/components/ui';

const STATUS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Ativo', tone: 'success' },
  PENDING_PAYMENT: { label: 'Aguardando pagamento', tone: 'warning' },
  PAST_DUE: { label: 'Pagamento em atraso', tone: 'warning' },
  SUSPENDED: { label: 'Suspenso', tone: 'danger' },
  EXPIRED: { label: 'Expirado', tone: 'neutral' },
  CANCELLED: { label: 'Cancelado', tone: 'neutral' },
};

const STATUS_ORDER: Record<string, number> = {
  ACTIVE: 0,
  PAST_DUE: 1,
  PENDING_PAYMENT: 2,
  SUSPENDED: 3,
};

const ENDED = ['EXPIRED', 'CANCELLED'];

export default function PlanosScreen() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['me', 'plans'],
    queryFn: () => api<PlanResponse[]>('/me/plans'),
  });
  const servicesQuery = useQuery({
    queryKey: ['services'],
    queryFn: () => api<ServiceResponse[]>('/services'),
  });

  const serviceName = (id: string) =>
    servicesQuery.data?.find((s) => s.id === id)?.name ?? 'Serviço';

  const plans = data ?? [];
  const current = plans
    .filter((p) => !ENDED.includes(p.status))
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
  const ended = plans.filter((p) => ENDED.includes(p.status));

  return (
    <Screen>
      <ScreenHeader subtitle="Contratos" title="Meus planos" />

      {isLoading ? (
        <LoadingState label="Carregando seus planos…" />
      ) : isError ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Falha ao carregar"
          description={error instanceof Error ? error.message : 'Tente novamente em instantes.'}
        />
      ) : plans.length === 0 ? (
        <EmptyState
          icon="albums-outline"
          title="Nenhum plano ainda"
          description="Fale com a recepção da clínica para contratar um pacote de sessões ou uma assinatura."
        />
      ) : (
        <ScrollView
          contentContainerClassName="gap-5 px-5 pb-8 pt-1"
          showsVerticalScrollIndicator={false}
        >
          {current.length > 0 && (
            <View className="gap-3">
              {ended.length > 0 && (
                <Text className="text-[13px] font-bold uppercase tracking-wide text-slate-400">
                  Planos atuais
                </Text>
              )}
              {current.map((plan) => (
                <ActivePlanCard
                  key={plan.id}
                  plan={plan}
                  serviceName={serviceName(plan.serviceId)}
                />
              ))}
            </View>
          )}

          {ended.length > 0 && (
            <View className="gap-3">
              <Text className="text-[13px] font-bold uppercase tracking-wide text-slate-400">
                Encerrados
              </Text>
              {ended.map((plan) => (
                <EndedPlanCard
                  key={plan.id}
                  plan={plan}
                  serviceName={serviceName(plan.serviceId)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

function ActivePlanCard({ plan, serviceName }: { plan: PlanResponse; serviceName: string }) {
  const isPackage = plan.type === 'PACKAGE';
  const status = STATUS[plan.status] ?? { label: plan.status, tone: 'neutral' as Tone };
  const u = usage(plan);

  return (
    <Card className="p-4">
      <View className="flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-2xl bg-brand-cyanSoft">
          <Ionicons name={isPackage ? 'cube-outline' : 'repeat'} size={22} color="#0097A7" />
        </View>
        <View className="flex-1">
          <Text className="text-[15px] font-bold text-brand-ink">{serviceName}</Text>
          <Text className="text-xs font-semibold text-slate-400">
            {isPackage ? 'Pacote de sessões' : 'Assinatura mensal'}
          </Text>
        </View>
        <Badge label={status.label} tone={status.tone} />
      </View>

      <View className="mt-4">
        <View className="flex-row items-end justify-between">
          <View className="flex-row items-baseline">
            <Text
              className={`text-3xl font-extrabold ${u.low ? 'text-amber-500' : 'text-brand-cyanDeep'}`}
            >
              {u.value}
            </Text>
            <Text className="ml-1.5 text-sm font-medium text-slate-400">{u.label}</Text>
          </View>
          <Text className="text-xs font-semibold text-slate-400">{u.used}</Text>
        </View>
        <ProgressBar value={u.ratio} tone={u.low ? 'warning' : 'brand'} />
      </View>

      <View className="my-3.5 h-px bg-slate-100" />

      <View className="flex-row items-center gap-1.5">
        <Ionicons
          name={isPackage ? 'calendar-outline' : 'refresh-outline'}
          size={14}
          color="#94a3b8"
        />
        <Text className="text-[13px] text-slate-500">{u.footer}</Text>
        {u.warn ? (
          <Text className="text-[13px] font-semibold text-amber-600"> · {u.warn}</Text>
        ) : null}
      </View>
    </Card>
  );
}

function EndedPlanCard({ plan, serviceName }: { plan: PlanResponse; serviceName: string }) {
  const isPackage = plan.type === 'PACKAGE';
  const status = STATUS[plan.status] ?? { label: plan.status, tone: 'neutral' as Tone };
  return (
    <Card className="flex-row items-center gap-3 p-3.5">
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
        <Ionicons name={isPackage ? 'cube-outline' : 'repeat'} size={18} color="#94a3b8" />
      </View>
      <View className="flex-1">
        <Text className="text-[14px] font-bold text-slate-500">{serviceName}</Text>
        <Text className="text-xs text-slate-400">
          {isPackage ? 'Pacote de sessões' : 'Assinatura mensal'}
        </Text>
      </View>
      <Badge label={status.label} tone={status.tone} />
    </Card>
  );
}

function ProgressBar({ value, tone }: { value: number; tone: 'brand' | 'warning' }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <View className="mt-2.5 h-2.5 flex-row overflow-hidden rounded-full bg-slate-100">
      <View
        style={{ flex: pct }}
        className={`h-full rounded-full ${tone === 'warning' ? 'bg-amber-400' : 'bg-brand-cyan'}`}
      />
      <View style={{ flex: 100 - pct }} />
    </View>
  );
}

interface Usage {
  value: number;
  label: string;
  used: string;
  ratio: number;
  low: boolean;
  footer: string;
  warn: string | null;
}

function usage(plan: PlanResponse): Usage {
  if (plan.type === 'PACKAGE') {
    const total = plan.totalSessions ?? 0;
    const remaining = plan.remainingSessions ?? 0;
    const consumed = Math.max(total - remaining, 0);
    let footer = 'Sem data de validade';
    let warn: string | null = null;
    if (plan.validUntil) {
      footer = `Válido até ${formatDate(plan.validUntil)}`;
      const d = daysUntil(plan.validUntil);
      if (d > 0 && d <= 30) warn = `expira em ${d} ${d === 1 ? 'dia' : 'dias'}`;
    }
    return {
      value: remaining,
      label: remaining === 1 ? 'sessão restante' : 'sessões restantes',
      used: `${consumed}/${total} usadas`,
      ratio: total > 0 ? remaining / total : 0,
      low: total > 0 && remaining / total <= 0.25,
      footer,
      warn,
    };
  }
  const quota = plan.weeklyQuota ?? 0;
  const used = plan.weeklyUsage ?? 0;
  const avail = Math.max(quota - used, 0);
  return {
    value: avail,
    label: avail === 1 ? 'disponível esta semana' : 'disponíveis esta semana',
    used: `${used}/${quota} usadas`,
    ratio: quota > 0 ? avail / quota : 0,
    low: quota > 0 && avail === 0,
    footer: 'Renova toda segunda-feira',
    warn: null,
  };
}

function daysUntil(value: string | Date): number {
  const tz = 'America/Sao_Paulo';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const target = new Date(value).toLocaleDateString('en-CA', { timeZone: tz });
  return Math.round((Date.parse(target) - Date.parse(today)) / 86_400_000);
}

function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}
