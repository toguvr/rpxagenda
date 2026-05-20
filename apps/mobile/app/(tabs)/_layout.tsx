import { useEffect, useState } from 'react';
import { Redirect, Tabs, useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { getAccessToken } from '@/lib/auth';
import { setSessionExpiredHandler } from '@/lib/api';

export default function TabsLayout() {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    getAccessToken().then((token) => setAuthed(!!token));
    setSessionExpiredHandler(() => router.replace('/login'));
  }, [router]);

  if (authed === null) {
    return (
      <View className="flex-1 items-center justify-center bg-brand-bgDark">
        <ActivityIndicator color="#00BCD4" />
      </View>
    );
  }
  if (!authed) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#0A0A0A' },
        headerTintColor: '#ffffff',
        tabBarActiveTintColor: '#00BCD4',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { backgroundColor: '#0A0A0A', borderTopColor: '#262626' },
      }}
    >
      <Tabs.Screen name="agenda" options={{ title: 'Agenda' }} />
      <Tabs.Screen name="planos" options={{ title: 'Planos' }} />
    </Tabs>
  );
}
