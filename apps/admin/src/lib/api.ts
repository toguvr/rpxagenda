'use client';

import { clearSession, getAccessToken, getRefreshToken, saveSession } from './auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

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
  /** Não tenta refresh em 401. Usar nos endpoints de auth. */
  skipAuth?: boolean;
  /** Já é o retry após refresh — evita loop. */
  _isRetry?: boolean;
}

/**
 * Fetch wrapper que injeta o Bearer access token, faz refresh automático
 * em 401 (uma vez), e devolve `ApiError` tipada para chamadas com falha.
 */
export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (!opts.skipAuth) {
    const access = getAccessToken();
    if (access) headers['Authorization'] = `Bearer ${access}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  // Refresh path
  if (res.status === 401 && !opts.skipAuth && !opts._isRetry) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return api<T>(path, { ...opts, _isRetry: true });
    } else {
      clearSession();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* texto bruto, deixa null */
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

// Single-flight: 401s concorrentes (dashboard/listas carregando juntas)
// compartilham UM único refresh. Sem isso, cada uma apresenta o MESMO refresh
// token; a rotação revoga no 1º uso e os demais caem na detecção de reuso do
// servidor, que revoga a sessão inteira — deslogando o usuário.
let refreshInFlight: Promise<boolean> | null = null;

function tryRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function doRefresh(): Promise<boolean> {
  const refresh = getRefreshToken();
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
      user: import('@rpx/shared').AuthenticatedUser;
    };
    saveSession(data.accessToken, data.refreshToken, data.user);
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
    user: import('@rpx/shared').AuthenticatedUser;
  }>('/auth/login', {
    method: 'POST',
    body: { email, password },
    skipAuth: true,
  });
}

export async function logoutApi() {
  const refresh = getRefreshToken();
  if (refresh) {
    try {
      await api('/auth/logout', {
        method: 'POST',
        body: { refreshToken: refresh },
        skipAuth: true,
      });
    } catch {
      // ok — apenas best-effort
    }
  }
  clearSession();
}
