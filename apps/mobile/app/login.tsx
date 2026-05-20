import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, login } from '@/lib/api';
import { saveSession } from '@/lib/auth';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    try {
      const res = await login(email.trim(), password);
      await saveSession(res.accessToken, res.refreshToken, res.user);
      router.replace('/(tabs)/agenda');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível conectar. Verifique sua internet.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-brand-bgDark">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-center px-6"
      >
        <View className="mb-10 items-center">
          <View className="h-16 w-16 items-center justify-center rounded-2xl bg-brand-cyan">
            <Text className="text-3xl font-bold text-white">R</Text>
          </View>
          <Text className="mt-4 text-2xl font-bold text-white">RPX Expert</Text>
          <Text className="text-sm text-neutral-400">App do paciente</Text>
        </View>

        <View className="gap-4">
          <View>
            <Text className="mb-1 text-sm font-medium text-neutral-300">E-mail</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="seu@email.com"
              placeholderTextColor="#6b7280"
              className="rounded-lg bg-neutral-800 px-4 py-3 text-white"
            />
          </View>
          <View>
            <Text className="mb-1 text-sm font-medium text-neutral-300">Senha</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor="#6b7280"
              className="rounded-lg bg-neutral-800 px-4 py-3 text-white"
            />
          </View>

          {error && (
            <Text className="rounded-lg bg-red-950 px-3 py-2 text-sm text-red-300">{error}</Text>
          )}

          <Pressable
            onPress={handleLogin}
            disabled={loading}
            className="mt-2 items-center rounded-lg bg-brand-cyan py-3.5 active:opacity-80"
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-base font-semibold text-white">Entrar</Text>
            )}
          </Pressable>
        </View>

        <Text className="mt-8 text-center text-xs text-neutral-500">
          Recebeu um convite? Use o link enviado pela clínica para criar sua senha.
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
