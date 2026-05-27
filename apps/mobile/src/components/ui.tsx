import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Tela base — fundo canvas + safe area no topo. */
export function Screen({
  children,
  edges = ['top'],
}: {
  children: ReactNode;
  edges?: ('top' | 'bottom')[];
}) {
  return (
    <SafeAreaView edges={edges} className="flex-1 bg-brand-canvas">
      {children}
    </SafeAreaView>
  );
}

/** Cabeçalho de tela — título grande, subtítulo opcional, slot à direita. */
export function ScreenHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <View className="flex-row items-center justify-between px-5 pb-3 pt-2">
      <View className="flex-1">
        {subtitle ? (
          <Text className="text-[13px] font-semibold uppercase tracking-wide text-brand-cyanDark">
            {subtitle}
          </Text>
        ) : null}
        <Text className="mt-0.5 text-[26px] font-extrabold leading-8 text-brand-ink">{title}</Text>
      </View>
      {right}
    </View>
  );
}

/** Botão circular de ícone — usado em cabeçalhos. */
export function IconButton({
  icon,
  onPress,
  tone = 'neutral',
}: {
  icon: IconName;
  onPress: () => void;
  tone?: 'neutral' | 'danger';
}) {
  const styles = tone === 'danger' ? 'bg-rose-50 border-rose-100' : 'bg-white border-slate-200';
  const color = tone === 'danger' ? '#e11d48' : '#0B1F24';
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      className={`h-11 w-11 items-center justify-center rounded-full border active:opacity-70 ${styles}`}
    >
      <Ionicons name={icon} size={20} color={color} />
    </Pressable>
  );
}

/** Cartão branco com borda suave e sombra leve. */
export function Card({
  children,
  className = '',
  onPress,
}: {
  children: ReactNode;
  className?: string;
  onPress?: () => void;
}) {
  const base = `rounded-3xl border border-slate-200/80 bg-brand-surface ${className}`;
  if (onPress) {
    return (
      <Pressable onPress={onPress} className={`${base} active:opacity-90`}>
        {children}
      </Pressable>
    );
  }
  return <View className={base}>{children}</View>;
}

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const TONE_STYLE: Record<Tone, { wrap: string; dot: string; text: string }> = {
  neutral: { wrap: 'bg-slate-100', dot: 'bg-slate-400', text: 'text-slate-600' },
  brand: { wrap: 'bg-brand-cyanSoft', dot: 'bg-brand-cyan', text: 'text-brand-cyanDeep' },
  success: { wrap: 'bg-emerald-50', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  warning: { wrap: 'bg-amber-50', dot: 'bg-amber-500', text: 'text-amber-700' },
  danger: { wrap: 'bg-rose-50', dot: 'bg-rose-500', text: 'text-rose-600' },
};

/** Selo de status com bolinha colorida. */
export function Badge({ label, tone }: { label: string; tone: Tone }) {
  const s = TONE_STYLE[tone];
  return (
    <View className={`flex-row items-center gap-1.5 rounded-full px-2.5 py-1 ${s.wrap}`}>
      <View className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      <Text className={`text-xs font-semibold ${s.text}`}>{label}</Text>
    </View>
  );
}

/** Estado vazio — ícone, título, descrição e ação opcional. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: IconName;
  title: string;
  description: string;
  action?: { label: string; onPress: () => void; icon?: IconName };
}) {
  return (
    <View className="flex-1 items-center justify-center px-10">
      <View className="h-20 w-20 items-center justify-center rounded-full bg-brand-cyanSoft">
        <Ionicons name={icon} size={34} color="#0097A7" />
      </View>
      <Text className="mt-5 text-lg font-bold text-brand-ink">{title}</Text>
      <Text className="mt-1.5 text-center text-[15px] leading-5 text-slate-500">{description}</Text>
      {action ? (
        <View className="mt-6 w-full">
          <PrimaryButton label={action.label} onPress={action.onPress} icon={action.icon} />
        </View>
      ) : null}
    </View>
  );
}

/** Estado de carregamento centralizado. */
export function LoadingState({ label }: { label?: string }) {
  return (
    <View className="flex-1 items-center justify-center">
      <ActivityIndicator color="#00BCD4" />
      {label ? <Text className="mt-3 text-sm text-slate-400">{label}</Text> : null}
    </View>
  );
}

type ButtonVariant = 'solid' | 'outline' | 'danger' | 'ghost';

/** Botão de ação — variantes solid (ciano), outline, danger e ghost. */
export function PrimaryButton({
  label,
  onPress,
  icon,
  loading = false,
  disabled = false,
  variant = 'solid',
  size = 'lg',
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
  size?: 'md' | 'lg';
}) {
  const off = disabled || loading;
  const pad = size === 'lg' ? 'py-4' : 'py-2.5';

  const VARIANT: Record<ButtonVariant, { wrap: string; text: string; icon: string }> = {
    solid: { wrap: 'bg-brand-cyan', text: 'text-white', icon: '#ffffff' },
    outline: {
      wrap: 'bg-white border border-brand-cyan',
      text: 'text-brand-cyanDark',
      icon: '#0097A7',
    },
    danger: { wrap: 'bg-white border border-rose-200', text: 'text-rose-600', icon: '#e11d48' },
    ghost: { wrap: 'bg-transparent', text: 'text-slate-500', icon: '#64748b' },
  };
  const v = VARIANT[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      className={`flex-row items-center justify-center gap-2 rounded-2xl ${pad} ${
        off ? 'bg-slate-200' : `${v.wrap} active:opacity-80`
      }`}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'solid' ? '#ffffff' : '#0097A7'} />
      ) : (
        <>
          {icon ? (
            <Ionicons name={icon} size={size === 'lg' ? 19 : 17} color={off ? '#94a3b8' : v.icon} />
          ) : null}
          <Text
            className={`font-bold ${size === 'lg' ? 'text-base' : 'text-sm'} ${
              off ? 'text-slate-400' : v.text
            }`}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
