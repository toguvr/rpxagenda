export const UserRole = {
  ADMIN: 'ADMIN',
  PROFESSIONAL: 'PROFESSIONAL',
  PATIENT: 'PATIENT',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const ALL_USER_ROLES: readonly UserRole[] = Object.values(UserRole);
