import * as SecureStore from 'expo-secure-store';
import type { AuthenticatedUser } from '@rpx/shared';

/**
 * Tokens guardados em expo-secure-store (Keychain no iOS, Keystore no Android) —
 * o storage seguro recomendado pelo CLAUDE.md §7.3 para o app do paciente.
 */
const ACCESS_KEY = 'rpx_access_token';
const REFRESH_KEY = 'rpx_refresh_token';
const USER_KEY = 'rpx_user';

export async function saveSession(
  accessToken: string,
  refreshToken: string,
  user: AuthenticatedUser,
): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthenticatedUser;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}
