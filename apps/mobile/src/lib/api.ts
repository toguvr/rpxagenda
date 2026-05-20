import type { AuthenticatedUser } from '@rpx/shared';
import { clearSession, getAccessToken, getRefreshToken, saveSession } from './auth';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3333';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  skipAuth?: boolean;
  _isRetry?: boolean;
}

/**
 * Fetch wrapper do app do paciente — injeta Bearer, faz refresh automático
 * em 401 (uma vez) e devolve `ApiError` tipada.
 *
 * `onSessionExpired` permite a camada de UI reagir (ex: navegar para login)
 * quando o refresh falha.
 */
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!opts.skipAuth) {
    const access = await getAccessToken();
    if (access) headers['Authorization'] = `Bearer ${access}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401 && !opts.skipAuth && !opts._isRetry) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return api<T>(path, { ...opts, _isRetry: true });
    }
    await clearSession();
    onSessionExpired?.();
    throw new ApiError(401, 'SESSION_EXPIRED', 'Sessão expirada. Faça login novamente.');
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* texto bruto */
  }

  if (!res.ok) {
    const err = parsed as { message?: string; code?: string; details?: unknown } | null;
    throw new ApiError(
      res.status,
      err?.code ?? 'HTTP_ERROR',
      err?.message ?? `HTTP ${res.status}`,
      err?.details,
    );
  }

  return parsed as T;
}

async function tryRefresh(): Promise<boolean> {
  const refresh = await getRefreshToken();
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      accessToken: string;
      refreshToken: string;
      user: AuthenticatedUser;
    };
    await saveSession(data.accessToken, data.refreshToken, data.user);
    return true;
  } catch {
    return false;
  }
}

// ---- helpers de domínio ----

export async function login(email: string, password: string) {
  return api<{
    accessToken: string;
    refreshToken: string;
    user: AuthenticatedUser;
  }>('/auth/login', { method: 'POST', body: { email, password }, skipAuth: true });
}

export async function logoutApi() {
  const refresh = await getRefreshToken();
  if (refresh) {
    try {
      await api('/auth/logout', {
        method: 'POST',
        body: { refreshToken: refresh },
        skipAuth: true,
      });
    } catch {
      /* best-effort */
    }
  }
  await clearSession();
}
