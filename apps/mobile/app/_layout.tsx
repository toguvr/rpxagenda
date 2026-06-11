import '../global.css';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ForcedUpdateGate } from '@/components/ForcedUpdateGate';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <ForcedUpdateGate>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="agendar" options={{ presentation: 'modal' }} />
          </Stack>
        </ForcedUpdateGate>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
