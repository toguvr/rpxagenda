import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import type { PlanResponse, ServiceResponse, Slot } from '@rpx/shared';
import { api, ApiError } from '@/lib/api';
import { Card, IconButton, PrimaryButton } from '@/components/ui';

const atendente = require('../assets/atendente.png');

interface SlotsResponse {
  date: string;
  timezone: string;
  serviceId: string;
  slots: Slot[];
}

interface DayOption {
  iso: string;
  dayNum: string;
  month: string;
  weekday: string;
  summary: string;
}

type StepState = 'active' | 'done' | 'pending';
type Period = 'Manhã' | 'Tarde' | 'Noite';

/** Próximos `count` dias a partir de hoje no fuso da clínica. */
function nextDays(count: number): DayOption[] {
  const tz = 'America/Sao_Paulo';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const [y, m, d] = today.split('-').map(Number);
  const anchor = Date.UTC(y, m - 1, d, 12, 0, 0);
  return Array.from({ length: count }, (_, i) => {
    const dt = new Date(anchor + i * 86_400_000);
    const summary = dt.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      timeZone: 'UTC',
    });
    return {
      iso: dt.toISOString().slice(0, 10),
      dayNum: dt.toLocaleDateString('pt-BR', { day: '2-digit', timeZone: 'UTC' }),
      month: dt
        .toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' })
        .replace('.', '')
        .toUpperCase(),
      weekday: dt
        .toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' })
        .replace('.', '')
        .toUpperCase(),
      summary: summary.charAt(0).toUpperCase() + summary.slice(1),
    };
  });
}

function planAvailability(plan: PlanResponse): string {
  if (plan.type === 'PACKAGE') {
    return `${plan.remainingSessions ?? 0} sessões restantes`;
  }
  if (plan.weeklyUsage != null) {
    return `${Math.max((plan.weeklyQuota ?? 0) - plan.weeklyUsage, 0)} de ${plan.weeklyQuota ?? 0} nesta semana`;
  }
  return `${plan.weeklyQuota ?? 0}x por semana`;
}

function periodOf(localStart: string): Period {
  const h = Number(localStart.slice(0, 2));
  if (h < 12) return 'Manhã';
  if (h < 18) return 'Tarde';
  return 'Noite';
}

export default function AgendarScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const days = useMemo(() => nextDays(14), []);

  const [planId, setPlanId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slotStart, setSlotStart] = useState<string | null>(null);
  const [openStep, setOpenStep] = useState<1 | 2 | 3 | null>(1);

  const plansQuery = useQuery({
    queryKey: ['me', 'plans'],
    queryFn: () => api<PlanResponse[]>('/me/plans'),
  });
  const servicesQuery = useQuery({
    queryKey: ['services'],
    queryFn: () => api<ServiceResponse[]>('/services'),
  });

  const activePlans = plansQuery.data?.filter((p) => p.status === 'ACTIVE') ?? [];
  const serviceName = (serviceId: string) =>
    servicesQuery.data?.find((s) => s.id === serviceId)?.name ?? 'Serviço';
  const selectedPlan = activePlans.find((p) => p.id === planId) ?? null;
  const selectedDay = days.find((d) => d.iso === date) ?? null;

  // Atalho: se o paciente só tem um plano ativo, já seleciona e avança.
  useEffect(() => {
    if (planId) return;
    const active = plansQuery.data?.filter((p) => p.status === 'ACTIVE') ?? [];
    if (active.length === 1) {
      setPlanId(active[0].id);
      setOpenStep(2);
    }
  }, [plansQuery.data, planId]);

  const slotsQuery = useQuery({
    queryKey: ['slots', selectedPlan?.serviceId, date],
    queryFn: () =>
      api<SlotsResponse>(`/schedules/slots?serviceId=${selectedPlan!.serviceId}&date=${date}`),
    enabled: !!selectedPlan && !!date,
  });

  const slots = slotsQuery.data?.slots ?? [];
  const selectedSlot = slots.find((s) => String(s.startsAt) === slotStart) ?? null;
  const periods = (['Manhã', 'Tarde', 'Noite'] as const)
    .map((label) => ({ label, slots: slots.filter((s) => periodOf(s.localStart) === label) }))
    .filter((g) => g.slots.length > 0);

  const booking = useMutation({
    mutationFn: () =>
      api('/appointments', {
        method: 'POST',
        body: {
          patientId: selectedPlan!.patientId,
          serviceId: selectedPlan!.serviceId,
          planId: selectedPlan!.id,
          startsAt: slotStart,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me', 'appointments'] });
      queryClient.invalidateQueries({ queryKey: ['me', 'plans'] });
      router.back();
    },
  });

  function selectPlan(id: string) {
    setPlanId(id);
    setDate(null);
    setSlotStart(null);
    setOpenStep(2);
  }
  function selectDate(iso: string) {
    setDate(iso);
    setSlotStart(null);
    setOpenStep(3);
  }
  function selectSlot(iso: string) {
    setSlotStart(iso);
    setOpenStep(null);
  }

  const step1: StepState = openStep === 1 ? 'active' : selectedPlan ? 'done' : 'pending';
  const step2: StepState = openStep === 2 ? 'active' : date ? 'done' : 'pending';
  const step3: StepState = openStep === 3 ? 'active' : slotStart ? 'done' : 'pending';

  return (
    <SafeAreaView className="flex-1 bg-brand-canvas" edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      {/* cabeçalho */}
      <View className="flex-row items-center justify-between px-5 pb-3 pt-1">
        <View>
          <Text className="text-[13px] font-semibold uppercase tracking-wide text-brand-cyanDark">
            Nova sessão
          </Text>
          <Text className="mt-0.5 text-2xl font-extrabold text-brand-ink">Agendar</Text>
        </View>
        <IconButton icon="close" onPress={() => router.back()} />
      </View>

      <ScrollView
        contentContainerClassName="gap-3 px-5 pb-6 pt-1"
        showsVerticalScrollIndicator={false}
      >
        {/* Boas-vindas — a recepcionista contextualiza o ato de agendar */}
        <View className="flex-row items-center gap-3 overflow-hidden rounded-3xl bg-brand-cyanSoft p-4">
          <View className="flex-1">
            <Text className="text-[18px] font-extrabold leading-6 text-brand-cyanDeep">
              Vamos agendar{'\n'}sua sessão
            </Text>
            <Text className="mt-1.5 text-[13px] leading-4 text-brand-cyanDark">
              Estamos aqui pra te ajudar.
            </Text>
          </View>
          <Image source={atendente} className="h-40 w-40" resizeMode="contain" />
        </View>

        {/* Passo 1 — plano */}
        <StepCard
          n={1}
          title="Plano"
          state={step1}
          summary={selectedPlan ? serviceName(selectedPlan.serviceId) : undefined}
          onReopen={() => setOpenStep(1)}
        >
          {plansQuery.isLoading ? (
            <ActivityIndicator color="#00BCD4" className="my-2" />
          ) : activePlans.length === 0 ? (
            <Notice
              icon="information-circle"
              tone="warning"
              text="Você não tem planos ativos. Fale com a recepção da clínica."
            />
          ) : (
            <View className="gap-2">
              {activePlans.map((plan) => (
                <PlanOption
                  key={plan.id}
                  plan={plan}
                  serviceName={serviceName(plan.serviceId)}
                  selected={plan.id === planId}
                  onPress={() => selectPlan(plan.id)}
                />
              ))}
            </View>
          )}
        </StepCard>

        {/* Passo 2 — dia */}
        <StepCard
          n={2}
          title="Dia"
          state={step2}
          summary={selectedDay?.summary}
          onReopen={() => setOpenStep(2)}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="-mx-4"
            contentContainerClassName="gap-2 px-4"
          >
            {days.map((d, i) => {
              const active = d.iso === date;
              const tag = i === 0 ? 'HOJE' : i === 1 ? 'AMANHÃ' : d.weekday;
              return (
                <Pressable
                  key={d.iso}
                  onPress={() => selectDate(d.iso)}
                  className={`w-[66px] items-center rounded-2xl border py-3 ${
                    active ? 'border-brand-cyan bg-brand-cyan' : 'border-slate-200 bg-white'
                  }`}
                >
                  <Text
                    className={`text-[10px] font-bold ${
                      active ? 'text-white/80' : 'text-slate-400'
                    }`}
                  >
                    {tag}
                  </Text>
                  <Text
                    className={`my-0.5 text-xl font-extrabold ${
                      active ? 'text-white' : 'text-brand-ink'
                    }`}
                  >
                    {d.dayNum}
                  </Text>
                  <Text
                    className={`text-[10px] font-semibold ${
                      active ? 'text-white/80' : 'text-slate-400'
                    }`}
                  >
                    {d.month}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </StepCard>

        {/* Passo 3 — horário */}
        <StepCard
          n={3}
          title="Horário"
          state={step3}
          summary={
            selectedSlot ? `${selectedSlot.localStart} – ${selectedSlot.localEnd}` : undefined
          }
          onReopen={() => setOpenStep(3)}
        >
          {slotsQuery.isLoading ? (
            <ActivityIndicator color="#00BCD4" className="my-2" />
          ) : slotsQuery.isError ? (
            <Notice icon="alert-circle" tone="danger" text="Falha ao carregar os horários." />
          ) : periods.length === 0 ? (
            <Notice
              icon="calendar-clear-outline"
              tone="neutral"
              text="Nenhum horário disponível neste dia. Tente outra data."
            />
          ) : (
            <View className="gap-4">
              {periods.map((g) => (
                <View key={g.label}>
                  <Text className="mb-2 text-[13px] font-bold uppercase tracking-wide text-slate-400">
                    {g.label}
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {g.slots.map((slot) => {
                      const iso = String(slot.startsAt);
                      const active = iso === slotStart;
                      return (
                        <Pressable
                          key={iso}
                          onPress={() => selectSlot(iso)}
                          className={`rounded-xl border px-4 py-2.5 ${
                            active ? 'border-brand-cyan bg-brand-cyan' : 'border-slate-200 bg-white'
                          }`}
                        >
                          <Text
                            className={`text-sm font-bold ${
                              active ? 'text-white' : 'text-slate-700'
                            }`}
                          >
                            {slot.localStart}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          )}
        </StepCard>
      </ScrollView>

      {/* rodapé fixo */}
      <View className="border-t border-slate-200 bg-white px-5 pb-1 pt-3">
        {booking.isError && (
          <View className="mb-3 flex-row items-center gap-2 rounded-2xl bg-rose-50 px-3.5 py-2.5">
            <Ionicons name="alert-circle" size={18} color="#e11d48" />
            <Text className="flex-1 text-[13px] text-rose-700">
              {booking.error instanceof ApiError
                ? booking.error.message
                : 'Não foi possível agendar. Tente outro horário.'}
            </Text>
          </View>
        )}
        <PrimaryButton
          label="Confirmar agendamento"
          icon="checkmark"
          loading={booking.isPending}
          disabled={!slotStart}
          onPress={() => booking.mutate()}
        />
      </View>
    </SafeAreaView>
  );
}

/** Cartão de passo — expandido (ativo), recolhido com resumo (concluído) ou bloqueado. */
function StepCard({
  n,
  title,
  state,
  summary,
  onReopen,
  children,
}: {
  n: number;
  title: string;
  state: StepState;
  summary?: string;
  onReopen: () => void;
  children: ReactNode;
}) {
  if (state !== 'active') {
    const done = state === 'done';
    return (
      <Card onPress={done ? onReopen : undefined} className="px-4 py-3.5">
        <View className="flex-row items-center gap-3">
          <StepDot n={n} state={state} />
          <View className="flex-1">
            <Text
              className={`text-xs font-bold uppercase tracking-wide ${
                done ? 'text-slate-400' : 'text-slate-300'
              }`}
            >
              {title}
            </Text>
            {done && summary ? (
              <Text className="mt-0.5 text-[15px] font-bold text-brand-ink" numberOfLines={1}>
                {summary}
              </Text>
            ) : null}
          </View>
          {done ? (
            <Text className="text-[13px] font-bold text-brand-cyanDark">Alterar</Text>
          ) : (
            <Ionicons name="lock-closed" size={15} color="#cbd5e1" />
          )}
        </View>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <View className="flex-row items-center gap-3">
        <StepDot n={n} state="active" />
        <Text className="text-base font-extrabold text-brand-ink">{title}</Text>
      </View>
      <View className="mt-4">{children}</View>
    </Card>
  );
}

function StepDot({ n, state }: { n: number; state: StepState }) {
  if (state === 'pending') {
    return (
      <View className="h-8 w-8 items-center justify-center rounded-full bg-slate-100">
        <Text className="text-sm font-extrabold text-slate-400">{n}</Text>
      </View>
    );
  }
  return (
    <View className="h-8 w-8 items-center justify-center rounded-full bg-brand-cyan">
      {state === 'done' ? (
        <Ionicons name="checkmark" size={17} color="#ffffff" />
      ) : (
        <Text className="text-sm font-extrabold text-white">{n}</Text>
      )}
    </View>
  );
}

function PlanOption({
  plan,
  serviceName,
  selected,
  onPress,
}: {
  plan: PlanResponse;
  serviceName: string;
  selected: boolean;
  onPress: () => void;
}) {
  const isPackage = plan.type === 'PACKAGE';
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 rounded-2xl border p-3 ${
        selected ? 'border-brand-cyan bg-brand-cyanSoft' : 'border-slate-200 bg-white'
      }`}
    >
      <View
        className={`h-10 w-10 items-center justify-center rounded-xl ${
          selected ? 'bg-brand-cyan' : 'bg-slate-100'
        }`}
      >
        <Ionicons
          name={isPackage ? 'cube-outline' : 'repeat'}
          size={20}
          color={selected ? '#ffffff' : '#64748b'}
        />
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-bold text-brand-ink">{serviceName}</Text>
        <Text className="text-[13px] text-slate-500">{planAvailability(plan)}</Text>
      </View>
      <Ionicons
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={24}
        color={selected ? '#00BCD4' : '#cbd5e1'}
      />
    </Pressable>
  );
}

function Notice({
  icon,
  tone,
  text,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: 'warning' | 'danger' | 'neutral';
  text: string;
}) {
  const style = {
    warning: { wrap: 'bg-amber-50', icon: '#d97706', text: 'text-amber-700' },
    danger: { wrap: 'bg-rose-50', icon: '#e11d48', text: 'text-rose-700' },
    neutral: { wrap: 'bg-slate-100', icon: '#94a3b8', text: 'text-slate-500' },
  }[tone];
  return (
    <View className={`flex-row items-center gap-2 rounded-2xl px-3.5 py-3 ${style.wrap}`}>
      <Ionicons name={icon} size={18} color={style.icon} />
      <Text className={`flex-1 text-[13px] ${style.text}`}>{text}</Text>
    </View>
  );
}
