import { useEffect, useState } from 'react';
import { Redirect, Tabs, useRouter } from 'expo-router';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { getAccessToken } from '@/lib/auth';
import { setSessionExpiredHandler } from '@/lib/api';
import { LoadingState } from '@/components/ui';

export default function TabsLayout() {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    getAccessToken().then((token) => setAuthed(!!token));
    setSessionExpiredHandler(() => router.replace('/login'));
  }, [router]);

  if (authed === null) {
    return (
      <View className="flex-1 bg-brand-canvas">
        <LoadingState />
      </View>
    );
  }
  if (!authed) return <Redirect href="/login" />;

  return (
    <>
      <StatusBar style="dark" />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#0097A7',
          tabBarInactiveTintColor: '#94a3b8',
          tabBarStyle: {
            backgroundColor: '#ffffff',
            borderTopColor: '#e2e8f0',
            paddingTop: 6,
          },
          tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        }}
      >
        <Tabs.Screen
          name="agenda"
          options={{
            title: 'Agenda',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? 'calendar' : 'calendar-outline'}
                size={size}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="planos"
          options={{
            title: 'Planos',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'albums' : 'albums-outline'} size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </>
  );
}
