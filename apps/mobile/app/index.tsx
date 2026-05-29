import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { getAccessToken } from '@/lib/auth';

const emblem = require('../assets/emblem.png');

export default function Index() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    getAccessToken().then((token) => setAuthed(!!token));
  }, []);

  if (authed === null) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <StatusBar style="dark" />
        <Image source={emblem} className="h-24 w-24" resizeMode="contain" />
        <Text className="mt-4 text-xl font-extrabold tracking-tight text-brand-ink">
          RPX Agenda
        </Text>
        <ActivityIndicator color="#00BCD4" className="mt-8" />
      </View>
    );
  }

  return <Redirect href={authed ? '/(tabs)/agenda' : '/login'} />;
}
