import { z } from 'zod';
import { cuidSchema } from './common';

export const AppointmentStatus = {
  SCHEDULED: 'SCHEDULED',
  CONFIRMED: 'CONFIRMED',
  CHECKED_IN: 'CHECKED_IN',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
} as const;
export type AppointmentStatus = (typeof AppointmentStatus)[keyof typeof AppointmentStatus];

export const createAppointmentRequestSchema = z.object({
  patientId: cuidSchema,
  serviceId: cuidSchema,
  /** Opcional: ausente = agendamento avulso (sem plano), permitido só para Avaliação. */
  planId: cuidSchema.optional(),
  startsAt: z.coerce.date(),
  equipmentIds: z.array(cuidSchema).default([]),
});
export type CreateAppointmentRequest = z.infer<typeof createAppointmentRequestSchema>;

export const cancelAppointmentRequestSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type CancelAppointmentRequest = z.infer<typeof cancelAppointmentRequestSchema>;

/**
 * Remarcação de horário (drag-and-drop na agenda do admin). Revalida os limites
 * de capacidade do §4.3 para o novo horário (excluindo o próprio agendamento).
 * `force: true` permite ao admin remarcar mesmo violando a capacidade — a ação
 * é auditada como remarcação forçada.
 */
export const rescheduleAppointmentRequestSchema = z.object({
  startsAt: z.coerce.date(),
  force: z.boolean().default(false),
});
export type RescheduleAppointmentRequest = z.infer<typeof rescheduleAppointmentRequestSchema>;

export const appointmentResponseSchema = z.object({
  id: cuidSchema,
  unitId: cuidSchema,
  patientId: cuidSchema,
  serviceId: cuidSchema,
  planId: cuidSchema.nullable(),
  professionalId: cuidSchema.nullable(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  status: z.nativeEnum(AppointmentStatus),
  consumedSession: z.boolean(),
  checkedInAt: z.coerce.date().nullable(),
  completedAt: z.coerce.date().nullable(),
  cancelledAt: z.coerce.date().nullable(),
  cancelledById: cuidSchema.nullable(),
  cancellationReason: z.string().nullable(),
  revertedAt: z.coerce.date().nullable(),
  revertedById: cuidSchema.nullable(),
  equipmentIds: z.array(cuidSchema),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type AppointmentResponse = z.infer<typeof appointmentResponseSchema>;

export const listAppointmentsQuerySchema = z.object({
  patientId: cuidSchema.optional(),
  serviceId: cuidSchema.optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  status: z.nativeEnum(AppointmentStatus).optional(),
});
export type ListAppointmentsQuery = z.infer<typeof listAppointmentsQuerySchema>;

// ---------- agendamento recorrente (dias fixos) ----------

const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD');
const hhmmSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário deve estar no formato HH:MM (24h)');

/**
 * Cria vários agendamentos para os dias fixos de um paciente em um plano.
 * - PACKAGE: gera até esgotar as sessões restantes (limitado pela validade).
 * - SUBSCRIPTION: gera até `endDate` (ou o fim do plano).
 * `slots` = pares (dia da semana 0=Dom..6=Sáb, horário). Equipamentos vêm do
 * protocolo ativo do plano (resolvidos no servidor).
 */
export const createRecurringAppointmentsRequestSchema = z.object({
  patientId: cuidSchema,
  planId: cuidSchema,
  startDate: ymdSchema,
  /** Obrigatório para SUBSCRIPTION quando o plano não tem data de fim. */
  endDate: ymdSchema.optional(),
  slots: z
    .array(z.object({ weekday: z.number().int().min(0).max(6), time: hhmmSchema }))
    .min(1, 'Selecione ao menos um dia')
    .max(7),
});
export type CreateRecurringAppointmentsRequest = z.infer<
  typeof createRecurringAppointmentsRequestSchema
>;

export const recurringAppointmentsResponseSchema = z.object({
  created: z.array(appointmentResponseSchema),
  skipped: z.array(z.object({ startsAt: z.coerce.date(), reason: z.string() })),
});
export type RecurringAppointmentsResponse = z.infer<typeof recurringAppointmentsResponseSchema>;
