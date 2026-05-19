import { z } from 'zod';
import { PlanType } from '../enums';
import { cuidSchema } from './common';

export const PlanStatus = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  SUSPENDED: 'SUSPENDED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;
export type PlanStatus = (typeof PlanStatus)[keyof typeof PlanStatus];

/**
 * Discriminado por `type`: PACKAGE exige totalSessions + validUntil;
 * SUBSCRIPTION exige weeklyQuota.
 */
const baseCreate = z.object({
  patientId: cuidSchema,
  serviceId: cuidSchema,
  startsAt: z.coerce.date().optional(),
});

export const createPackagePlanSchema = baseCreate.extend({
  type: z.literal(PlanType.PACKAGE),
  totalSessions: z.number().int().positive().max(500),
  validUntil: z.coerce.date(),
});

export const createSubscriptionPlanSchema = baseCreate.extend({
  type: z.literal(PlanType.SUBSCRIPTION),
  weeklyQuota: z.number().int().positive().max(14, 'weeklyQuota máximo 14/semana'),
});

export const createPlanRequestSchema = z.discriminatedUnion('type', [
  createPackagePlanSchema,
  createSubscriptionPlanSchema,
]);
export type CreatePlanRequest = z.infer<typeof createPlanRequestSchema>;

export const updatePlanStatusRequestSchema = z.object({
  status: z.nativeEnum(PlanStatus),
  reason: z.string().max(500).optional(),
});
export type UpdatePlanStatusRequest = z.infer<typeof updatePlanStatusRequestSchema>;

export const planResponseSchema = z.object({
  id: cuidSchema,
  unitId: cuidSchema,
  patientId: cuidSchema,
  serviceId: cuidSchema,
  type: z.nativeEnum(PlanType),
  status: z.nativeEnum(PlanStatus),
  totalSessions: z.number().int().nullable(),
  remainingSessions: z.number().int().nullable(),
  validUntil: z.coerce.date().nullable(),
  weeklyQuota: z.number().int().nullable(),
  weeklyUsage: z.number().int().nullable().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type PlanResponse = z.infer<typeof planResponseSchema>;
