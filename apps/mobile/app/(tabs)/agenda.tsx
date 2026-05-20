import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { AppointmentResponse, ServiceResponse } from '@rpx/shared';
import { api, ApiError, logoutApi } from '@/lib/api';

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Agendado',
  CONFIRMED: 'Confirmado',
  CHECKED_IN: 'Check-in feito',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
  NO_SHOW: 'Faltou',
};

const STATUS_STYLE: Record<string, string> = {
  SCHEDULED: 'bg-neutral-200 text-neutral-700',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  CHECKED_IN: 'bg-brand-cyanLight text-brand-cyanDark',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-neutral-200 text-neutral-500',
  NO_SHOW: 'bg-red-100 text-red-700',
};

export default function AgendaScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['me', 'appointments'],
    queryFn: () => api<AppointmentResponse[]>('/me/appointments'),
  });
  const servicesQuery = useQuery({
    queryKey: ['services'],
    queryFn: () => api<ServiceResponse[]>('/services'),
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

  const sorted = data
    ?.slice()
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());

  const serviceName = (id: string) =>
    servicesQuery.data?.find((s) => s.id === id)?.name ?? 'Sessão';

  return (
    <View className="flex-1 bg-neutral-50">
      <View className="border-b border-neutral-200 bg-white p-4">
        <Pressable
          onPress={() => router.push('/agendar')}
          className="items-center rounded-lg bg-brand-cyan py-3 active:opacity-80"
        >
          <Text className="text-base font-semibold text-white">Agendar nova sessão</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#00BCD4" />
        </View>
      ) : isError ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-sm text-red-600">
            {error instanceof Error ? error.message : 'Falha ao carregar.'}
          </Text>
        </View>
      ) : !sorted || sorted.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-neutral-500">Você ainda não tem agendamentos.</Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.id}
          contentContainerClassName="p-4 gap-3"
          renderItem={({ item }) => (
            <AppointmentCard
              appointment={item}
              serviceName={serviceName(item.serviceId)}
              onCancel={() => askCancel(item.id)}
              onConfirm={() => confirmMutation.mutate(item.id)}
              busy={
                (cancelMutation.isPending && cancelMutation.variables === item.id) ||
                (confirmMutation.isPending && confirmMutation.variables === item.id)
              }
            />
          )}
        />
      )}

      <Pressable
        onPress={async () => {
          await logoutApi();
          router.replace('/login');
        }}
        className="border-t border-neutral-200 bg-white py-3 active:opacity-70"
      >
        <Text className="text-center text-sm text-neutral-500">Sair</Text>
      </Pressable>
    </View>
  );
}

function AppointmentCard({
  appointment,
  serviceName,
  onCancel,
  onConfirm,
  busy,
}: {
  appointment: AppointmentResponse;
  serviceName: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const start = new Date(appointment.startsAt);
  const end = new Date(appointment.endsAt);
  const isFuture = start.getTime() > Date.now();
  const canCancel = isFuture && ['SCHEDULED', 'CONFIRMED'].includes(appointment.status);
  const canConfirm = isFuture && appointment.status === 'SCHEDULED';

  return (
    <View className="rounded-xl border border-neutral-200 bg-white p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold text-neutral-900">{serviceName}</Text>
        <View
          className={`rounded-full px-2 py-0.5 ${
            (STATUS_STYLE[appointment.status] ?? 'bg-neutral-200 text-neutral-700').split(' ')[0]
          }`}
        >
          <Text
            className={`text-xs font-medium ${
              (STATUS_STYLE[appointment.status] ?? 'bg-neutral-200 text-neutral-700').split(' ')[1]
            }`}
          >
            {STATUS_LABEL[appointment.status] ?? appointment.status}
          </Text>
        </View>
      </View>
      <Text className="mt-1 text-sm text-neutral-500">
        {formatDate(start)} · {formatTime(start)} — {formatTime(end)}
      </Text>

      {(canConfirm || canCancel) && (
        <View className="mt-3 flex-row gap-2">
          {canConfirm && (
            <Pressable
              onPress={onConfirm}
              disabled={busy}
              className="flex-1 items-center rounded-lg border border-brand-cyan py-2 active:opacity-70"
            >
              {busy ? (
                <ActivityIndicator color="#00BCD4" />
              ) : (
                <Text className="text-sm font-medium text-brand-cyanDark">Confirmar presença</Text>
              )}
            </Pressable>
          )}
          {canCancel && (
            <Pressable
              onPress={onCancel}
              disabled={busy}
              className="flex-1 items-center rounded-lg border border-red-200 py-2 active:opacity-70"
            >
              <Text className="text-sm font-medium text-red-600">Cancelar</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });
}
