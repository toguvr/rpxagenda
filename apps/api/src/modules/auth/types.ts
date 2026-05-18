import type { UserRole } from '@rpx/shared';

/**
 * Identidade autenticada propagada no `req.user` pelo JwtStrategy.
 * Toda regra de domínio que dependa de quem chama deve receber este tipo via @CurrentUser().
 */
export interface RequestUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  unitId: string;
}

export interface JwtAccessPayload {
  sub: string;
  email: string;
  role: UserRole;
  unitId: string;
  fullName: string;
}
