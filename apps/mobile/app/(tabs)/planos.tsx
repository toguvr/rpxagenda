import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import type { PlanResponse } from '@rpx/shared';
import { api } from '@/lib/api';

const PLAN_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Ativo',
  PENDING_PAYMENT: 'Aguardando pagamento',
  PAST_DUE: 'Pagamento em atraso',
  SUSPENDED: 'Suspenso',
  EXPIRED: 'Expirado',
  CANCELLED: 'Cancelado',
};

export default function PlanosScreen() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['me', 'plans'],
    queryFn: () => api<PlanResponse[]>('/me/plans'),
  });

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-50">
        <ActivityIndicator color="#00BCD4" />
      </View>
    );
  }
  if (isError) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-50 px-6">
        <Text className="text-center text-sm text-red-600">
          {error instanceof Error ? error.message : 'Falha ao carregar.'}
        </Text>
      </View>
    );
  }
  if (!data || data.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-50 px-6">
        <Text className="text-center text-neutral-500">
          Você ainda não tem planos. Fale com a recepção da clínica.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-neutral-50">
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerClassName="p-4 gap-3"
        renderItem={({ item }) => <PlanCard plan={item} />}
      />
    </View>
  );
}

function PlanCard({ plan }: { plan: PlanResponse }) {
  const isPackage = plan.type === 'PACKAGE';
  return (
    <View className="rounded-xl border border-neutral-200 bg-white p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold text-neutral-900">
          {isPackage ? 'Pacote de sessões' : 'Assinatura'}
        </Text>
        <Text className="text-xs font-medium text-brand-cyanDark">
          {PLAN_STATUS_LABEL[plan.status] ?? plan.status}
        </Text>
      </View>

      {isPackage ? (
        <View className="mt-3">
          <Text className="text-2xl font-bold text-brand-cyanDark">
            {plan.remainingSessions ?? 0}
            <Text className="text-base font-normal text-neutral-400">
              {' '}
              / {plan.totalSessions ?? 0} sessões
            </Text>
          </Text>
          {plan.validUntil && (
            <Text className="mt-1 text-sm text-neutral-500">
              Válido até {new Date(plan.validUntil).toLocaleDateString('pt-BR')}
            </Text>
          )}
        </View>
      ) : (
        <View className="mt-3">
          <Text className="text-2xl font-bold text-brand-cyanDark">
            {plan.weeklyUsage ?? 0}
            <Text className="text-base font-normal text-neutral-400">
              {' '}
              / {plan.weeklyQuota ?? 0} por semana
            </Text>
          </Text>
          <Text className="mt-1 text-sm text-neutral-500">Reinicia toda segunda-feira</Text>
        </View>
      )}
    </View>
  );
}
