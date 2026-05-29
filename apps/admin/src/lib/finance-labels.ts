import type { ExpenseCategory, PaymentMethod, PaymentStatus } from '@rpx/shared';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  PIX: 'PIX',
  CREDIT_CARD: 'Cartão crédito',
  DEBIT_CARD: 'Cartão débito',
  CASH: 'Dinheiro',
  BOLETO: 'Boleto',
  BANK_TRANSFER: 'Transferência',
  OTHER: 'Outro',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PAID: 'Pago',
  PENDING: 'A receber',
  REFUNDED: 'Estornado',
  FAILED: 'Falhou',
};

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  PAID: 'bg-green-50 text-green-700',
  PENDING: 'bg-yellow-50 text-yellow-700',
  REFUNDED: 'bg-neutral-100 text-neutral-500',
  FAILED: 'bg-red-50 text-red-700',
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  RENT: 'Aluguel',
  PAYROLL: 'Folha / salários',
  SUPPLIES: 'Materiais',
  EQUIPMENT: 'Equipamentos',
  UTILITIES: 'Contas (água/luz/internet)',
  TAXES: 'Impostos',
  MARKETING: 'Marketing',
  OTHER: 'Outros',
};
