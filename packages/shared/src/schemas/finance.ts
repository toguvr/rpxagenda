import { z } from 'zod';
import { ExpenseCategory, PaymentMethod, PaymentStatus } from '../enums';
import { cuidSchema } from './common';

/**
 * Schemas do contexto financeiro (admin-only). Valores monetários sempre em
 * centavos (inteiro) — CLAUDE.md §7.1. Pagamentos são lançados manualmente
 * pelo admin; a integração Pagar.me (Fase 6) preencherá `pagarmeChargeId`.
 */

const amountCents = z.number().int().positive('Valor deve ser maior que zero').max(100_000_000);

// ---------- Pagamentos (entradas) ----------

export const createPaymentRequestSchema = z.object({
  /** Vínculo opcional com o plano cobrado. Se informado, o paciente é derivado dele. */
  planId: cuidSchema.optional(),
  /** Paciente da receita (opcional para recebimentos avulsos). */
  patientId: cuidSchema.optional(),
  amountCents,
  method: z.nativeEnum(PaymentMethod),
  status: z.nativeEnum(PaymentStatus).default(PaymentStatus.PAID),
  /** Quando o pagamento foi efetivamente recebido. Default: agora, se status PAID. */
  paidAt: z.coerce.date().optional(),
  /** Vencimento — usado para "a receber" e "em atraso" quando status PENDING. */
  dueAt: z.coerce.date().optional(),
  description: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type CreatePaymentRequest = z.infer<typeof createPaymentRequestSchema>;

export const updatePaymentRequestSchema = z.object({
  amountCents: amountCents.optional(),
  method: z.nativeEnum(PaymentMethod).optional(),
  status: z.nativeEnum(PaymentStatus).optional(),
  paidAt: z.coerce.date().nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
  description: z.string().trim().max(300).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export type UpdatePaymentRequest = z.infer<typeof updatePaymentRequestSchema>;

export const listPaymentsQuerySchema = z.object({
  status: z.nativeEnum(PaymentStatus).optional(),
  method: z.nativeEnum(PaymentMethod).optional(),
  patientId: cuidSchema.optional(),
  planId: cuidSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;

export const paymentResponseSchema = z.object({
  id: cuidSchema,
  unitId: cuidSchema,
  planId: cuidSchema.nullable(),
  patientId: cuidSchema.nullable(),
  amountCents: z.number().int(),
  method: z.nativeEnum(PaymentMethod),
  status: z.nativeEnum(PaymentStatus),
  paidAt: z.coerce.date().nullable(),
  dueAt: z.coerce.date().nullable(),
  description: z.string().nullable(),
  notes: z.string().nullable(),
  pagarmeChargeId: z.string().nullable(),
  createdById: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  // enriquecimento opcional para a listagem
  patientName: z.string().nullable().optional(),
  serviceName: z.string().nullable().optional(),
});
export type PaymentResponse = z.infer<typeof paymentResponseSchema>;

// ---------- Despesas (saídas) ----------

export const createExpenseRequestSchema = z.object({
  category: z.nativeEnum(ExpenseCategory),
  amountCents,
  paidAt: z.coerce.date(),
  description: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type CreateExpenseRequest = z.infer<typeof createExpenseRequestSchema>;

export const updateExpenseRequestSchema = createExpenseRequestSchema.partial();
export type UpdateExpenseRequest = z.infer<typeof updateExpenseRequestSchema>;

export const listExpensesQuerySchema = z.object({
  category: z.nativeEnum(ExpenseCategory).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;

export const expenseResponseSchema = z.object({
  id: cuidSchema,
  unitId: cuidSchema,
  category: z.nativeEnum(ExpenseCategory),
  amountCents: z.number().int(),
  paidAt: z.coerce.date(),
  description: z.string().nullable(),
  notes: z.string().nullable(),
  createdById: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ExpenseResponse = z.infer<typeof expenseResponseSchema>;

// ---------- Resumo financeiro ----------

export const financeSummaryQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type FinanceSummaryQuery = z.infer<typeof financeSummaryQuerySchema>;

export const financeSummaryResponseSchema = z.object({
  /** Janela considerada (ISO). Default: mês corrente no fuso da unidade. */
  from: z.string(),
  to: z.string(),
  /** Recebido no período (pagamentos PAID com paidAt na janela). */
  receivedCents: z.number().int(),
  /** A receber (pagamentos PENDING, independente da data). */
  pendingCents: z.number().int(),
  /** Em atraso (pagamentos PENDING com dueAt < agora). */
  overdueCents: z.number().int(),
  /** Despesas no período (paidAt na janela). */
  expensesCents: z.number().int(),
  /** Saldo do período = recebido − despesas. */
  balanceCents: z.number().int(),
  byMethod: z.array(
    z.object({
      method: z.nativeEnum(PaymentMethod),
      totalCents: z.number().int(),
      count: z.number().int(),
    }),
  ),
  byExpenseCategory: z.array(
    z.object({
      category: z.nativeEnum(ExpenseCategory),
      totalCents: z.number().int(),
      count: z.number().int(),
    }),
  ),
  paymentsCount: z.number().int(),
  expensesCount: z.number().int(),
});
export type FinanceSummaryResponse = z.infer<typeof financeSummaryResponseSchema>;
