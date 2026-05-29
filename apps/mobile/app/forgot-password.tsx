import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, api } from '@/lib/api';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [focused, setFocused] = useState(false);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = email.trim().length > 3 && email.includes('@');

  async function handleSubmit() {
    if (loading || !valid) return;
    setError(null);
    setLoading(true);
    try {
      await api('/auth/forgot-password', {
        method: 'POST',
        body: { email: email.trim() },
        skipAuth: true,
      });
      setSent(true);
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
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-6 pb-8 pt-2"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            className="mb-6 flex-row items-center gap-1 self-start"
          >
            <Ionicons name="chevron-back" size={20} color="#00BCD4" />
            <Text className="text-[15px] font-semibold text-brand-cyan">Voltar</Text>
          </Pressable>

          <View className="mb-6 items-center">
            <View className="mb-4 h-16 w-16 items-center justify-center rounded-3xl bg-brand-cyanSoft">
              <Ionicons name="lock-closed-outline" size={30} color="#0891b2" />
            </View>
            <Text className="text-2xl font-extrabold text-brand-ink">Esqueci a senha</Text>
            <Text className="mt-2 text-center text-[14px] leading-5 text-slate-500">
              Informe o e-mail da sua conta. Enviaremos um link para você criar uma nova senha.
            </Text>
          </View>

          {sent ? (
            <View className="gap-4">
              <View className="flex-row items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                <Ionicons name="checkmark-circle" size={20} color="#059669" />
                <Text className="flex-1 text-[13px] leading-5 text-emerald-800">
                  Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha.
                  Verifique sua caixa de entrada (e o spam). O link abre no navegador e vale por 30
                  minutos.
                </Text>
              </View>
              <Pressable
                onPress={() => router.replace('/login')}
                className="flex-row items-center justify-center gap-2 rounded-2xl bg-brand-cyan py-4 active:opacity-80"
              >
                <Text className="text-base font-bold text-white">Voltar para o login</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View>
                <Text className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                  E-mail
                </Text>
                <View
                  className={`flex-row items-center gap-3 rounded-2xl border bg-white px-4 ${
                    focused ? 'border-brand-cyan' : 'border-slate-200'
                  }`}
                >
                  <Ionicons name="mail-outline" size={20} color={focused ? '#00BCD4' : '#94a3b8'} />
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    placeholder="seu@email.com"
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="send"
                    onSubmitEditing={handleSubmit}
                    className="flex-1 py-3.5 text-base text-brand-ink"
                  />
                </View>
              </View>

              {error ? (
                <View className="mt-4 flex-row items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-3">
                  <Ionicons name="alert-circle" size={18} color="#e11d48" />
                  <Text className="flex-1 text-[13px] leading-4 text-rose-700">{error}</Text>
                </View>
              ) : null}

              <Pressable
                onPress={handleSubmit}
                disabled={loading || !valid}
                className={`mt-6 flex-row items-center justify-center gap-2 rounded-2xl py-4 ${
                  valid ? 'bg-brand-cyan active:opacity-80' : 'bg-brand-cyan/30'
                }`}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Text
                      className={`text-base font-bold ${valid ? 'text-white' : 'text-white/70'}`}
                    >
                      Enviar link
                    </Text>
                    <Ionicons
                      name="paper-plane-outline"
                      size={18}
                      color={valid ? '#ffffff' : 'rgba(255,255,255,0.7)'}
                    />
                  </>
                )}
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
