import { useEffect, useState, type ReactNode } from 'react';
import { Image, Linking, Platform, Pressable, Text, View } from 'react-native';
import * as Application from 'expo-application';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3333';
const emblem = require('../../assets/emblem.png');

interface AppVersion {
  minVersion: string;
  latestVersion: string;
  ios: string;
  android: string;
}

/** Compara versões "x.y.z": <0 se a<b, 0 se igual, >0 se a>b. */
function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * Gate de atualização obrigatória. Consulta `GET /app-version` no início e, se a
 * versão NATIVA instalada for menor que `minVersion`, bloqueia o app com uma tela
 * pedindo para atualizar na loja. Renderiza os filhos otimisticamente (não atrasa
 * o launch); se a checagem indicar versão obsoleta, troca para a tela de bloqueio.
 * Falha de rede = não bloqueia (soft-fail).
 */
export function ForcedUpdateGate({ children }: { children: ReactNode }) {
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);

    (async () => {
      try {
        const res = await fetch(`${API_URL}/app-version`, { signal: ctrl.signal });
        if (!res.ok) return;
        const data = (await res.json()) as AppVersion;
        const current = Application.nativeApplicationVersion ?? '0.0.0';
        if (compareSemver(current, data.minVersion) < 0) {
          const url = Platform.OS === 'ios' ? data.ios : data.android;
          if (!cancelled) setBlockedUrl(url || '');
        }
      } catch {
        /* offline/timeout: não bloqueia */
      } finally {
        clearTimeout(timer);
      }
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
      clearTimeout(timer);
    };
  }, []);

  if (blockedUrl !== null) return <UpdateRequiredScreen url={blockedUrl} />;
  return <>{children}</>;
}

function UpdateRequiredScreen({ url }: { url: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-6 bg-white px-8">
      <Image source={emblem} className="h-16 w-56" resizeMode="contain" />
      <View className="items-center gap-2">
        <Text className="text-center text-2xl font-extrabold text-brand-ink">
          Atualização necessária
        </Text>
        <Text className="text-center text-base leading-6 text-slate-500">
          Saiu uma nova versão do RPX Agenda. Atualize para continuar usando o app.
        </Text>
      </View>
      <Pressable
        onPress={() => url && Linking.openURL(url)}
        disabled={!url}
        className={`w-full flex-row items-center justify-center rounded-2xl py-4 ${
          url ? 'bg-brand-cyan active:opacity-80' : 'bg-brand-cyan/30'
        }`}
      >
        <Text className="text-base font-bold text-white">Atualizar agora</Text>
      </Pressable>
    </View>
  );
}
