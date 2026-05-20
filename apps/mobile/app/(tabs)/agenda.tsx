import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { AppointmentResponse } from '@rpx/shared';
import { api, logoutApi } from '@/lib/api';

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
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['me', 'appointments'],
    queryFn: () => api<AppointmentResponse[]>('/me/appointments'),
  });

  const sorted = data
    ?.slice()
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());

  return (
    <View className="flex-1 bg-neutral-50">
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
          renderItem={({ item }) => <AppointmentCard appointment={item} />}
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

function AppointmentCard({ appointment }: { appointment: AppointmentResponse }) {
  const start = new Date(appointment.startsAt);
  const end = new Date(appointment.endsAt);
  return (
    <View className="rounded-xl border border-neutral-200 bg-white p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold text-neutral-900">{formatDate(start)}</Text>
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
        {formatTime(start)} — {formatTime(end)}
      </Text>
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
