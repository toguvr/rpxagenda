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
