import { type ReactNode, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import type { AppointmentResponse, PlanResponse, ServiceResponse } from '@rpx/shared';
import { api, ApiError, logoutApi } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import {
  Badge,
  Card,
  EmptyState,
  IconButton,
  LoadingState,
  PrimaryButton,
  Screen,
  type Tone,
} from '@/components/ui';

const STATUS: Record<string, { label: string; tone: Tone }> = {
  SCHEDULED: { label: 'Agendado', tone: 'neutral' },
  CONFIRMED: { label: 'Confirmado', tone: 'brand' },
  CHECKED_IN: { label: 'Check-in feito', tone: 'brand' },
  COMPLETED: { label: 'Concluído', tone: 'success' },
  CANCELLED: { label: 'Cancelado', tone: 'neutral' },
  NO_SHOW: { label: 'Faltou', tone: 'danger' },
};

const ACTIVE_STATUS = ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN'];

export default function AgendaScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState<string | null>(null);

  useEffect(() => {
    getCurrentUser().then((u) => setFirstName(u?.fullName?.trim().split(/\s+/)[0] ?? null));
  }, []);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['me', 'appointments'],
    queryFn: () => api<AppointmentResponse[]>('/me/appointments'),
  });
  const servicesQuery = useQuery({
    queryKey: ['services'],
    queryFn: () => api<ServiceResponse[]>('/services'),
  });
  const plansQuery = useQuery({
    queryKey: ['me', 'plans'],
    queryFn: () => api<PlanResponse[]>('/me/plans'),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['me', 'appointments'] });
    queryClient.invalidateQueries({ queryKey: ['me', 'plans'] });
  }

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api(`/appointments/${id}/cancel`, { method: 'POST', body: {} }),
    onSuccess: invalidate,
    onError: (err) =>
      Alert.alert(
        'Não foi possível cancelar',
        err instanceof ApiError ? err.message : 'Tente novamente.',
      ),
  });
  const confirmMutation = useMutation({
    mutationFn: (id: string) => api(`/appointments/${id}/confirm`, { method: 'POST', body: {} }),
    onSuccess: invalidate,
    onError: (err) =>
      Alert.alert(
        'Não foi possível confirmar',
        err instanceof ApiError ? err.message : 'Tente novamente.',
      ),
  });

  function askCancel(id: string) {
    Alert.alert(
      'Cancelar agendamento',
      'Dentro do prazo de cancelamento a sessão volta para o seu plano. Fora do prazo, ela é descontada.',
      [
        { text: 'Voltar', style: 'cancel' },
        { text: 'Cancelar sessão', style: 'destructive', onPress: () => cancelMutation.mutate(id) },
      ],
    );
  }
  function askLogout() {
    Alert.alert('Sair da conta', 'Você precisará entrar novamente para usar o app.', [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await logoutApi();
          router.replace('/login');
        },
      },
    ]);
  }

  const serviceName = (id: string) =>
    servicesQuery.data?.find((s) => s.id === id)?.name ?? 'Sessão';
  const busyId = (m: typeof cancelMutation) => (m.isPending ? (m.variables as string) : null);

  const now = Date.now();
  const appts = data ?? [];
  const upcoming = appts
    .filter((a) => ACTIVE_STATUS.includes(a.status) && new Date(a.startsAt).getTime() >= now)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const past = appts
    .filter((a) => !(ACTIVE_STATUS.includes(a.status) && new Date(a.startsAt).getTime() >= now))
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
  const hero = upcoming[0] ?? null;
  const restUpcoming = upcoming.slice(1);
  const activePlans = (plansQuery.data ?? []).filter((p) => p.status === 'ACTIVE');

  const cardActions = (a: AppointmentResponse) => ({
    onConfirm: () => confirmMutation.mutate(a.id),
    onCancel: () => askCancel(a.id),
    confirming: busyId(confirmMutation) === a.id,
    cancelling: busyId(cancelMutation) === a.id,
  });

  return (
    <Screen>
      <HomeHeader firstName={firstName} onLogout={askLogout} />

      {isLoading ? (
        <LoadingState label="Carregando sua agenda…" />
      ) : isError ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Falha ao carregar"
          description={error instanceof Error ? error.message : 'Tente novamente em instantes.'}
        />
      ) : (
        <ScrollView
          contentContainerClassName="gap-5 px-5 pb-8 pt-2"
          showsVerticalScrollIndicator={false}
        >
          <NextSessionHero
            appointment={hero}
            serviceName={hero ? serviceName(hero.serviceId) : ''}
            onBook={() => router.push('/agendar')}
            {...(hero ? cardActions(hero) : {})}
          />

          {hero && (
            <PrimaryButton
              label="Agendar nova sessão"
              icon="add"
              variant="outline"
              onPress={() => router.push('/agendar')}
            />
          )}

          {activePlans.length > 0 && (
            <Section title="Seus planos">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="-mx-5"
                contentContainerClassName="gap-3 px-5"
              >
                {activePlans.map((plan) => (
                  <PlanChip
                    key={plan.id}
                    plan={plan}
                    serviceName={serviceName(plan.serviceId)}
                    onPress={() => router.push('/(tabs)/planos')}
                  />
                ))}
              </ScrollView>
            </Section>
          )}

          {restUpcoming.length > 0 && (
            <Section title="Próximas sessões">
              <View className="gap-3">
                {restUpcoming.map((a) => (
                  <AppointmentCard
                    key={a.id}
                    appointment={a}
                    serviceName={serviceName(a.serviceId)}
                    {...cardActions(a)}
                  />
                ))}
              </View>
            </Section>
          )}

          {past.length > 0 && (
            <Section title="Histórico">
              <View className="gap-3">
                {past.map((a) => (
                  <AppointmentCard
                    key={a.id}
                    appointment={a}
                    serviceName={serviceName(a.serviceId)}
                    {...cardActions(a)}
                  />
                ))}
              </View>
            </Section>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

function HomeHeader({ firstName, onLogout }: { firstName: string | null; onLogout: () => void }) {
  return (
    <View className="flex-row items-center gap-3 px-5 pb-3 pt-2">
      <View className="h-12 w-12 items-center justify-center rounded-full bg-brand-cyanSoft">
        <Text className="text-lg font-extrabold text-brand-cyanDeep">
          {firstName ? firstName.charAt(0).toUpperCase() : '?'}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-[13px] font-semibold text-slate-400">{greeting()},</Text>
        <Text className="text-xl font-extrabold text-brand-ink" numberOfLines={1}>
          {firstName ?? 'Bem-vindo(a)'}
        </Text>
      </View>
      <IconButton icon="log-out-outline" onPress={onLogout} />
    </View>
  );
}

function NextSessionHero({
  appointment,
  serviceName,
  onBook,
  onConfirm,
  onCancel,
  confirming,
  cancelling,
}: {
  appointment: AppointmentResponse | null;
  serviceName: string;
  onBook: () => void;
  onConfirm?: () => void;
  onCancel?: () => void;
  confirming?: boolean;
  cancelling?: boolean;
}) {
  if (!appointment) {
    return (
      <Card className="items-center p-6">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-cyanSoft">
          <Ionicons name="calendar-outline" size={30} color="#0097A7" />
        </View>
        <Text className="mt-3 text-lg font-bold text-brand-ink">Nenhuma sessão agendada</Text>
        <Text className="mt-1 text-center text-[14px] leading-5 text-slate-500">
          Marque sua próxima sessão de tratamento em poucos toques.
        </Text>
        <View className="mt-4 w-full">
          <PrimaryButton label="Agendar sessão" icon="add" onPress={onBook} />
        </View>
      </Card>
    );
  }

  const start = new Date(appointment.startsAt);
  const end = new Date(appointment.endsAt);
  const canConfirm = appointment.status === 'SCHEDULED';
  const canCancel = ['SCHEDULED', 'CONFIRMED'].includes(appointment.status);
  const busy = !!confirming || !!cancelling;

  return (
    <Card className="overflow-hidden">
      <View className="flex-row items-center justify-between bg-brand-cyan px-4 py-2.5">
        <Text className="text-xs font-bold uppercase tracking-wide text-white/90">
          Próxima sessão
        </Text>
        <View className="rounded-full bg-white/25 px-2.5 py-0.5">
          <Text className="text-xs font-extrabold text-white">{countdownLabel(start)}</Text>
        </View>
      </View>

      <View className="p-4">
        <View className="flex-row items-center gap-3.5">
          <DateChip date={start} muted={false} />
          <View className="flex-1">
            <Text className="text-lg font-extrabold text-brand-ink">{serviceName}</Text>
            <View className="mt-1 flex-row items-center gap-1.5">
              <Ionicons name="time-outline" size={14} color="#94a3b8" />
              <Text className="text-[13px] text-slate-500">
                {weekday(start)} · {time(start)} – {time(end)}
              </Text>
            </View>
          </View>
        </View>

        {appointment.status === 'CONFIRMED' && (
          <View className="mt-3 flex-row items-center gap-1.5">
            <Ionicons name="checkmark-circle" size={16} color="#0097A7" />
            <Text className="text-[13px] font-semibold text-brand-cyanDark">
              Presença confirmada
            </Text>
          </View>
        )}

        {(canConfirm || canCancel) && (
          <View className="mt-4 flex-row gap-2">
            {canConfirm && onConfirm && (
              <View className="flex-1">
                <PrimaryButton
                  label="Confirmar"
                  icon="checkmark"
                  size="md"
                  loading={confirming}
                  disabled={busy}
                  onPress={onConfirm}
                />
              </View>
            )}
            {canCancel && onCancel && (
              <View className="flex-1">
                <PrimaryButton
                  label="Cancelar"
                  icon="close"
                  variant="danger"
                  size="md"
                  loading={cancelling}
                  disabled={busy}
                  onPress={onCancel}
                />
              </View>
            )}
          </View>
        )}
      </View>
    </Card>
  );
}

function PlanChip({
  plan,
  serviceName,
  onPress,
}: {
  plan: PlanResponse;
  serviceName: string;
  onPress: () => void;
}) {
  const isPackage = plan.type === 'PACKAGE';
  const balance = planBalance(plan);
  return (
    <Pressable
      onPress={onPress}
      className="w-[168px] rounded-2xl border border-slate-200/80 bg-brand-surface p-3.5 active:opacity-90"
    >
      <View className="flex-row items-center gap-2">
        <View className="h-7 w-7 items-center justify-center rounded-lg bg-brand-cyanSoft">
          <Ionicons name={isPackage ? 'cube-outline' : 'repeat'} size={15} color="#0097A7" />
        </View>
        <Text className="flex-1 text-[13px] font-bold text-brand-ink" numberOfLines={1}>
          {serviceName}
        </Text>
      </View>
      <Text className="mt-2.5 text-2xl font-extrabold text-brand-cyanDeep">{balance.value}</Text>
      <Text className="text-[11px] font-medium text-slate-400">{balance.label}</Text>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2.5">
      <Text className="text-[13px] font-bold uppercase tracking-wide text-slate-400">{title}</Text>
      {children}
    </View>
  );
}

function AppointmentCard({
  appointment,
  serviceName,
  onCancel,
  onConfirm,
  cancelling,
  confirming,
}: {
  appointment: AppointmentResponse;
  serviceName: string;
  onCancel: () => void;
  onConfirm: () => void;
  cancelling: boolean;
  confirming: boolean;
}) {
  const start = new Date(appointment.startsAt);
  const end = new Date(appointment.endsAt);
  const isFuture = start.getTime() > Date.now();
  const canCancel = isFuture && ['SCHEDULED', 'CONFIRMED'].includes(appointment.status);
  const canConfirm = isFuture && appointment.status === 'SCHEDULED';
  const isHistory = !ACTIVE_STATUS.includes(appointment.status) || !isFuture;
  const status = STATUS[appointment.status] ?? {
    label: appointment.status,
    tone: 'neutral' as Tone,
  };
  const busy = cancelling || confirming;

  return (
    <Card className="flex-row gap-3.5 p-3.5">
      <DateChip date={start} muted={isHistory} />
      <View className="flex-1">
        <View className="flex-row items-start justify-between gap-2">
          <Text
            className={`flex-1 text-[15px] font-bold ${
              isHistory ? 'text-slate-500' : 'text-brand-ink'
            }`}
          >
            {serviceName}
          </Text>
          <Badge label={status.label} tone={status.tone} />
        </View>
        <View className="mt-1.5 flex-row items-center gap-1.5">
          <Ionicons name="time-outline" size={14} color="#94a3b8" />
          <Text className="text-[13px] text-slate-500">
            {weekday(start)} · {time(start)} – {time(end)}
          </Text>
        </View>

        {(canConfirm || canCancel) && (
          <View className="mt-3 flex-row gap-2">
            {canConfirm && (
              <View className="flex-1">
                <PrimaryButton
                  label="Confirmar"
                  icon="checkmark"
                  variant="outline"
                  size="md"
                  loading={confirming}
                  disabled={busy}
                  onPress={onConfirm}
                />
              </View>
            )}
            {canCancel && (
              <View className="flex-1">
                <PrimaryButton
                  label="Cancelar"
                  icon="close"
                  variant="danger"
                  size="md"
                  loading={cancelling}
                  disabled={busy}
                  onPress={onCancel}
                />
              </View>
            )}
          </View>
        )}
      </View>
    </Card>
  );
}

function DateChip({ date, muted }: { date: Date; muted: boolean }) {
  const day = date.toLocaleDateString('pt-BR', { day: '2-digit', timeZone: 'America/Sao_Paulo' });
  const month = date
    .toLocaleDateString('pt-BR', { month: 'short', timeZone: 'America/Sao_Paulo' })
    .replace('.', '')
    .toUpperCase();
  return (
    <View
      className={`h-[60px] w-[56px] items-center justify-center rounded-2xl ${
        muted ? 'bg-slate-100' : 'bg-brand-cyanSoft'
      }`}
    >
      <Text
        className={`text-xl font-extrabold ${muted ? 'text-slate-500' : 'text-brand-cyanDeep'}`}
      >
        {day}
      </Text>
      <Text
        className={`text-[10px] font-bold tracking-wide ${
          muted ? 'text-slate-400' : 'text-brand-cyanDark'
        }`}
      >
        {month}
      </Text>
    </View>
  );
}

function greeting(): string {
  const h = Number(
    new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'America/Sao_Paulo',
    }),
  );
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function daysUntil(start: Date): number {
  const tz = 'America/Sao_Paulo';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const target = start.toLocaleDateString('en-CA', { timeZone: tz });
  return Math.round((Date.parse(target) - Date.parse(today)) / 86_400_000);
}

function countdownLabel(start: Date): string {
  const n = daysUntil(start);
  if (n <= 0) return 'Hoje';
  if (n === 1) return 'Amanhã';
  return `Em ${n} dias`;
}

function planBalance(plan: PlanResponse): { value: string; label: string } {
  if (plan.type === 'PACKAGE') {
    return { value: String(plan.remainingSessions ?? 0), label: 'sessões restantes' };
  }
  const avail = Math.max((plan.weeklyQuota ?? 0) - (plan.weeklyUsage ?? 0), 0);
  return { value: String(avail), label: 'disponíveis na semana' };
}

function weekday(d: Date): string {
  return d.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'America/Sao_Paulo' });
}

function time(d: Date): string {
  return d.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });
}
