'use client';

import type { AuthenticatedUser } from '@rpx/shared';

/**
 * Armazenamento de tokens — `localStorage` por agora.
 *
 * PREMISSA (validar): migrar para cookies httpOnly em sessão de hardening.
 * Vantagem do localStorage: simples, funciona com cross-origin (API em 3333,
 * admin em 4000) sem precisar de `credentials: include` + CSRF.
 * Desvantagem: vulnerável a XSS. Para o admin (uso interno), risco baixo.
 */
const ACCESS_KEY = 'rpx_access_token';
const REFRESH_KEY = 'rpx_refresh_token';
const USER_KEY = 'rpx_user';

export function saveSession(accessToken: string, refreshToken: string, user: AuthenticatedUser) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function getCurrentUser(): AuthenticatedUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthenticatedUser;
  } catch {
    return null;
  }
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}
