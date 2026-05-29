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

// ----- Financeiro -----

export const PaymentMethod = {
  PIX: 'PIX',
  CREDIT_CARD: 'CREDIT_CARD',
  DEBIT_CARD: 'DEBIT_CARD',
  CASH: 'CASH',
  BOLETO: 'BOLETO',
  BANK_TRANSFER: 'BANK_TRANSFER',
  OTHER: 'OTHER',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];
export const ALL_PAYMENT_METHODS: readonly PaymentMethod[] = Object.values(PaymentMethod);

export const PaymentStatus = {
  PAID: 'PAID',
  PENDING: 'PENDING',
  REFUNDED: 'REFUNDED',
  FAILED: 'FAILED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];
export const ALL_PAYMENT_STATUSES: readonly PaymentStatus[] = Object.values(PaymentStatus);

export const ExpenseCategory = {
  RENT: 'RENT',
  PAYROLL: 'PAYROLL',
  SUPPLIES: 'SUPPLIES',
  EQUIPMENT: 'EQUIPMENT',
  UTILITIES: 'UTILITIES',
  TAXES: 'TAXES',
  MARKETING: 'MARKETING',
  OTHER: 'OTHER',
} as const;
export type ExpenseCategory = (typeof ExpenseCategory)[keyof typeof ExpenseCategory];
export const ALL_EXPENSE_CATEGORIES: readonly ExpenseCategory[] = Object.values(ExpenseCategory);
