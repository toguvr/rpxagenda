import { z } from 'zod';
import { PlanType, ServiceType } from '../enums';
import { cuidSchema } from './common';

const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().min(0);

export const createServiceRequestSchema = z.object({
  name: z.string().trim().min(2, 'Nome muito curto').max(80, 'Nome muito longo'),
  type: z.nativeEnum(ServiceType),
  durationMinutes: positiveInt.max(8 * 60, 'Duração máxima de 8h'),
  slotCapacity: positiveInt.max(100).default(1),
  cancellationLeadMinutes: nonNegativeInt.max(60 * 24 * 7).default(240),
  schedulingLeadMinutes: nonNegativeInt.max(60 * 24 * 7).default(60),
  checkInWindowBeforeMin: nonNegativeInt.max(60 * 4).default(30),
  checkInWindowAfterMin: nonNegativeInt.max(60 * 4).default(15),
  noShowGraceMinutes: nonNegativeInt.max(60 * 4).default(15),
  acceptedPlanType: z.nativeEnum(PlanType),
  active: z.boolean().default(true),
});
export type CreateServiceRequest = z.infer<typeof createServiceRequestSchema>;

export const updateServiceRequestSchema = createServiceRequestSchema.partial();
export type UpdateServiceRequest = z.infer<typeof updateServiceRequestSchema>;

export const serviceResponseSchema = z.object({
  id: cuidSchema,
  unitId: cuidSchema,
  name: z.string(),
  type: z.nativeEnum(ServiceType),
  durationMinutes: z.number().int(),
  slotCapacity: z.number().int(),
  cancellationLeadMinutes: z.number().int(),
  schedulingLeadMinutes: z.number().int(),
  checkInWindowBeforeMin: z.number().int(),
  checkInWindowAfterMin: z.number().int(),
  noShowGraceMinutes: z.number().int(),
  acceptedPlanType: z.nativeEnum(PlanType),
  active: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ServiceResponse = z.infer<typeof serviceResponseSchema>;
