import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { getAccessToken } from '@/lib/auth';

export default function Index() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    getAccessToken().then((token) => setAuthed(!!token));
  }, []);

  if (authed === null) {
    return (
      <View className="flex-1 items-center justify-center bg-brand-bgDark">
        <ActivityIndicator color="#00BCD4" />
      </View>
    );
  }

  return <Redirect href={authed ? '/(tabs)/agenda' : '/login'} />;
}
