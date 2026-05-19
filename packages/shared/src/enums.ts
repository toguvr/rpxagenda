export const UserRole = {
  ADMIN: 'ADMIN',
  PROFESSIONAL: 'PROFESSIONAL',
  PATIENT: 'PATIENT',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
export const ALL_USER_ROLES: readonly UserRole[] = Object.values(UserRole);

export const ServiceType = {
  FISIO: 'FISIO',
  MUSCULACAO: 'MUSCULACAO',
  RPG: 'RPG',
  PILATES: 'PILATES',
  AVALIACAO: 'AVALIACAO',
} as const;
export type ServiceType = (typeof ServiceType)[keyof typeof ServiceType];
export const ALL_SERVICE_TYPES: readonly ServiceType[] = Object.values(ServiceType);

export const PlanType = {
  PACKAGE: 'PACKAGE',
  SUBSCRIPTION: 'SUBSCRIPTION',
} as const;
export type PlanType = (typeof PlanType)[keyof typeof PlanType];
export const ALL_PLAN_TYPES: readonly PlanType[] = Object.values(PlanType);
