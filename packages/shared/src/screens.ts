/**
 * Catálogo de telas do painel admin. Fonte da verdade compartilhada entre
 * backend (guard de permissão) e admin (menu, guarda de rota e formulário de
 * convite do profissional).
 *
 * A `key` é o identificador estável persistido em `Professional.allowedScreens`
 * e propagado no JWT (claim `permissions`). O `path` é a rota base no admin.
 */
export const ScreenKey = {
  DASHBOARD: 'dashboard',
  APPOINTMENTS: 'appointments',
  PATIENTS: 'patients',
  PLANS: 'plans',
  FINANCE: 'finance',
  SERVICES: 'services',
  SCHEDULES: 'schedules',
  EQUIPMENTS: 'equipments',
  PROFESSIONALS: 'professionals',
  IDFACE: 'idface',
} as const;
export type ScreenKey = (typeof ScreenKey)[keyof typeof ScreenKey];

export const ALL_SCREEN_KEYS: readonly ScreenKey[] = Object.values(ScreenKey);

export interface ScreenDef {
  key: ScreenKey;
  /** Rótulo exibido no menu e no formulário (PT-BR). */
  label: string;
  /** Rota base no admin (usada pela guarda de rota client-side). */
  path: string;
  /** Telas operacionais que esta tela costuma consultar (dropdowns, etc). */
  dependsOn?: readonly ScreenKey[];
  /**
   * Tela cujos dados de LEITURA também são privados: só quem tem a permissão
   * pode ler (GET) via API. Telas sem esta flag têm leitura liberada para
   * qualquer profissional autenticado, porque são dados de referência
   * consultados por outras telas (ex: a Agenda lê serviços/equipamentos). A
   * ESCRITA (POST/PATCH/DELETE) sempre exige a permissão da tela.
   */
  readProtected?: boolean;
}

/**
 * Ordem aqui = ordem do menu lateral. Manter alinhado com o `NAV` do layout
 * autenticado do admin.
 */
export const SCREENS: readonly ScreenDef[] = [
  { key: ScreenKey.DASHBOARD, label: 'Painel', path: '/dashboard' },
  {
    key: ScreenKey.APPOINTMENTS,
    label: 'Agenda',
    path: '/appointments',
    dependsOn: [ScreenKey.PATIENTS, ScreenKey.SERVICES],
  },
  { key: ScreenKey.PATIENTS, label: 'Pacientes', path: '/patients' },
  {
    key: ScreenKey.PLANS,
    label: 'Planos',
    path: '/plans',
    dependsOn: [ScreenKey.PATIENTS, ScreenKey.SERVICES],
  },
  { key: ScreenKey.FINANCE, label: 'Financeiro', path: '/finance', readProtected: true },
  { key: ScreenKey.SERVICES, label: 'Serviços', path: '/services' },
  { key: ScreenKey.SCHEDULES, label: 'Horários', path: '/schedules' },
  { key: ScreenKey.EQUIPMENTS, label: 'Equipamentos', path: '/equipments' },
  { key: ScreenKey.PROFESSIONALS, label: 'Profissionais', path: '/professionals' },
  { key: ScreenKey.IDFACE, label: 'iDFace', path: '/idface-devices', readProtected: true },
];

/** Telas cuja LEITURA também é restrita à permissão (não liberada por padrão). */
export const READ_PROTECTED_SCREEN_KEYS: readonly ScreenKey[] = SCREENS.filter(
  (s) => s.readProtected,
).map((s) => s.key);

/** Resolve a tela cujo `path` casa com um pathname do admin (match por prefixo). */
export function screenForPath(pathname: string): ScreenDef | undefined {
  return SCREENS.find((s) => pathname === s.path || pathname.startsWith(`${s.path}/`));
}

/**
 * Permissões efetivas de um usuário, dado o papel e (para PROFESSIONAL) as
 * telas concedidas. ADMIN tem todas; PATIENT não acessa o admin.
 */
export function effectiveScreens(
  role: 'ADMIN' | 'PROFESSIONAL' | 'PATIENT',
  allowedScreens: readonly string[] = [],
): ScreenKey[] {
  if (role === 'ADMIN') return [...ALL_SCREEN_KEYS];
  if (role === 'PROFESSIONAL') {
    return ALL_SCREEN_KEYS.filter((k) => allowedScreens.includes(k));
  }
  return [];
}
