import { z } from 'zod';
import { cuidSchema } from './common';

export const createProtocolRequestSchema = z.object({
  patientId: cuidSchema,
  professionalId: cuidSchema,
  /** Opcional: a avaliação pode ser registrada antes de existir um plano comercial. */
  planId: cuidSchema.optional(),
  /** Agendamento de avaliação que originou o protocolo (opcional). */
  appointmentId: cuidSchema.optional(),
  totalSessions: z.number().int().positive().max(500),
  sessionsPerWeek: z.number().int().positive().max(14),
  diagnosis: z.string().trim().min(3).max(2000),
  observations: z.string().trim().max(4000).optional(),
  equipmentIds: z.array(cuidSchema).default([]),
});
export type CreateProtocolRequest = z.infer<typeof createProtocolRequestSchema>;

export const updateProtocolRequestSchema = z.object({
  totalSessions: z.number().int().positive().max(500).optional(),
  sessionsPerWeek: z.number().int().positive().max(14).optional(),
  diagnosis: z.string().trim().min(3).max(2000).optional(),
  observations: z.string().trim().max(4000).optional(),
  active: z.boolean().optional(),
  equipmentIds: z.array(cuidSchema).optional(),
});
export type UpdateProtocolRequest = z.infer<typeof updateProtocolRequestSchema>;

export const protocolResponseSchema = z.object({
  id: cuidSchema,
  unitId: cuidSchema,
  patientId: cuidSchema,
  professionalId: cuidSchema,
  planId: cuidSchema.nullable(),
  appointmentId: cuidSchema.nullable(),
  totalSessions: z.number().int(),
  sessionsPerWeek: z.number().int(),
  diagnosis: z.string(),
  observations: z.string().nullable(),
  active: z.boolean(),
  equipmentIds: z.array(cuidSchema),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ProtocolResponse = z.infer<typeof protocolResponseSchema>;
