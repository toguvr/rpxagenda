import { forwardRef, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { ApiError, login } from '@/lib/api';
import { saveSession } from '@/lib/auth';

const welcome = require('../assets/welcome.png');

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export default function LoginScreen() {
  const router = useRouter();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const hasInput = email.trim().length > 0 && password.length > 0;

  async function handleLogin() {
    if (loading || !hasInput) return;
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
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="flex-grow px-6 pb-8 pt-2"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Caricatura — a própria ilustração já traz "Bem-vindo!" */}
          <View className="items-center">
            <Image source={welcome} className="h-80 w-full" resizeMode="contain" />
          </View>

          {/* Formulário */}
          <View className="mt-2 gap-4">
            <LabeledField
              label="E-mail"
              icon="mail-outline"
              focused={focused === 'email'}
              value={email}
              onChangeText={setEmail}
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused(null)}
              placeholder="seu@email.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <LabeledField
              ref={passwordRef}
              label="Senha"
              icon="lock-closed-outline"
              focused={focused === 'password'}
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused(null)}
              placeholder="Sua senha"
              secureTextEntry={!showPassword}
              autoComplete="password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={handleLogin}
              trailing={
                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={10}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#94a3b8"
                  />
                </Pressable>
              }
            />
          </View>

          {error ? (
            <View className="mt-4 flex-row items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-3">
              <Ionicons name="alert-circle" size={18} color="#e11d48" />
              <Text className="flex-1 text-[13px] leading-4 text-rose-700">{error}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={handleLogin}
            disabled={loading || !hasInput}
            className={`mt-6 flex-row items-center justify-center gap-2 rounded-2xl py-4 ${
              hasInput ? 'bg-brand-cyan active:opacity-80' : 'bg-brand-cyan/30'
            }`}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Text
                  className={`text-base font-bold ${hasInput ? 'text-white' : 'text-white/70'}`}
                >
                  Entrar
                </Text>
                <Ionicons
                  name="arrow-forward"
                  size={18}
                  color={hasInput ? '#ffffff' : 'rgba(255,255,255,0.7)'}
                />
              </>
            )}
          </Pressable>

          {/* Rodapé — primeiro acesso */}
          <View className="mt-8 flex-row items-center gap-3">
            <View className="h-px flex-1 bg-slate-200" />
            <Text className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Primeiro acesso
            </Text>
            <View className="h-px flex-1 bg-slate-200" />
          </View>
          <View className="mt-3 flex-row items-start gap-2 px-1">
            <Ionicons name="information-circle-outline" size={16} color="#94a3b8" />
            <Text className="flex-1 text-[13px] leading-5 text-slate-500">
              O cadastro é feito pela clínica. Use o link de convite recebido para criar sua senha
              de acesso.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

interface LabeledFieldProps extends React.ComponentProps<typeof TextInput> {
  label: string;
  icon: IconName;
  focused: boolean;
  trailing?: React.ReactNode;
}

const LabeledField = forwardRef<TextInput, LabeledFieldProps>(function LabeledField(
  { label, icon, focused, trailing, ...input },
  ref,
) {
  return (
    <View>
      <Text className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </Text>
      <View
        className={`flex-row items-center gap-3 rounded-2xl border bg-white px-4 ${
          focused ? 'border-brand-cyan' : 'border-slate-200'
        }`}
      >
        <Ionicons name={icon} size={20} color={focused ? '#00BCD4' : '#94a3b8'} />
        <TextInput
          ref={ref}
          placeholderTextColor="#94a3b8"
          className="flex-1 py-3.5 text-base text-brand-ink"
          {...input}
        />
        {trailing}
      </View>
    </View>
  );
});
