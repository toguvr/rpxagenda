import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PlanResponse, ServiceResponse, Slot } from '@rpx/shared';
import { api, ApiError } from '@/lib/api';

interface SlotsResponse {
  date: string;
  timezone: string;
  serviceId: string;
  slots: Slot[];
}

interface DayOption {
  iso: string;
  day: string;
  weekday: string;
}

/** Próximos `count` dias a partir de hoje no fuso da clínica. */
function nextDays(count: number): DayOption[] {
  const tz = 'America/Sao_Paulo';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const [y, m, d] = today.split('-').map(Number);
  const anchor = Date.UTC(y, m - 1, d, 12, 0, 0);
  return Array.from({ length: count }, (_, i) => {
    const dt = new Date(anchor + i * 86_400_000);
    return {
      iso: dt.toISOString().slice(0, 10),
      day: dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }),
      weekday: dt.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }),
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

export default function AgendarScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const days = useMemo(() => nextDays(14), []);

  const [planId, setPlanId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slotStart, setSlotStart] = useState<string | null>(null);

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

  const slotsQuery = useQuery({
    queryKey: ['slots', selectedPlan?.serviceId, date],
    queryFn: () =>
      api<SlotsResponse>(`/schedules/slots?serviceId=${selectedPlan!.serviceId}&date=${date}`),
    enabled: !!selectedPlan && !!date,
  });

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
  }
  function selectDate(iso: string) {
    setDate(iso);
    setSlotStart(null);
  }

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
        <Text className="text-lg font-bold text-neutral-900">Novo agendamento</Text>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text className="text-sm font-medium text-neutral-500">Fechar</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerClassName="p-4 gap-6">
        {/* Passo 1 — plano */}
        <View className="gap-2">
          <Text className="text-sm font-semibold text-neutral-500">1. Escolha o plano</Text>
          {plansQuery.isLoading ? (
            <ActivityIndicator color="#00BCD4" />
          ) : activePlans.length === 0 ? (
            <Text className="text-sm text-neutral-500">
              Você não tem planos ativos. Fale com a recepção da clínica.
            </Text>
          ) : (
            activePlans.map((plan) => {
              const active = plan.id === planId;
              return (
                <Pressable
                  key={plan.id}
                  onPress={() => selectPlan(plan.id)}
                  className={`rounded-xl border p-4 ${
                    active ? 'border-brand-cyan bg-brand-cyanLight' : 'border-neutral-200 bg-white'
                  }`}
                >
                  <Text className="text-base font-semibold text-neutral-900">
                    {serviceName(plan.serviceId)}
                  </Text>
                  <Text className="mt-0.5 text-sm text-neutral-500">{planAvailability(plan)}</Text>
                </Pressable>
              );
            })
          )}
        </View>

        {/* Passo 2 — data */}
        {selectedPlan && (
          <View className="gap-2">
            <Text className="text-sm font-semibold text-neutral-500">2. Escolha o dia</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2">
                {days.map((d) => {
                  const active = d.iso === date;
                  return (
                    <Pressable
                      key={d.iso}
                      onPress={() => selectDate(d.iso)}
                      className={`w-16 items-center rounded-xl border py-2 ${
                        active ? 'border-brand-cyan bg-brand-cyan' : 'border-neutral-200 bg-white'
                      }`}
                    >
                      <Text className={`text-xs ${active ? 'text-white' : 'text-neutral-400'}`}>
                        {d.weekday}
                      </Text>
                      <Text
                        className={`text-sm font-semibold ${
                          active ? 'text-white' : 'text-neutral-900'
                        }`}
                      >
                        {d.day}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Passo 3 — horário */}
        {selectedPlan && date && (
          <View className="gap-2">
            <Text className="text-sm font-semibold text-neutral-500">3. Escolha o horário</Text>
            {slotsQuery.isLoading ? (
              <ActivityIndicator color="#00BCD4" />
            ) : slotsQuery.isError ? (
              <Text className="text-sm text-red-600">Falha ao carregar horários.</Text>
            ) : !slotsQuery.data || slotsQuery.data.slots.length === 0 ? (
              <Text className="text-sm text-neutral-500">Nenhum horário disponível neste dia.</Text>
            ) : (
              <View className="flex-row flex-wrap gap-2">
                {slotsQuery.data.slots.map((slot) => {
                  const iso = String(slot.startsAt);
                  const active = iso === slotStart;
                  return (
                    <Pressable
                      key={iso}
                      onPress={() => setSlotStart(iso)}
                      className={`rounded-lg border px-4 py-2 ${
                        active ? 'border-brand-cyan bg-brand-cyan' : 'border-neutral-200 bg-white'
                      }`}
                    >
                      <Text
                        className={`text-sm font-medium ${
                          active ? 'text-white' : 'text-neutral-700'
                        }`}
                      >
                        {slot.localStart}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {booking.isError && (
          <Text className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {booking.error instanceof ApiError
              ? booking.error.message
              : 'Não foi possível agendar. Tente outro horário.'}
          </Text>
        )}
      </ScrollView>

      <View className="border-t border-neutral-200 bg-white p-4">
        <Pressable
          onPress={() => booking.mutate()}
          disabled={!slotStart || booking.isPending}
          className={`items-center rounded-lg py-3.5 ${
            !slotStart || booking.isPending ? 'bg-neutral-300' : 'bg-brand-cyan active:opacity-80'
          }`}
        >
          {booking.isPending ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-base font-semibold text-white">Confirmar agendamento</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
