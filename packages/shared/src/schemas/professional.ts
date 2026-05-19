import { z } from 'zod';
import { cuidSchema, emailSchema, passwordSchema } from './common';

export const createProfessionalRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().trim().min(3).max(120),
  registry: z.string().trim().min(2, 'Registro inválido').max(40),
  serviceIds: z.array(cuidSchema).default([]),
  active: z.boolean().default(true),
});
export type CreateProfessionalRequest = z.infer<typeof createProfessionalRequestSchema>;

export const updateProfessionalRequestSchema = z.object({
  fullName: z.string().trim().min(3).max(120).optional(),
  registry: z.string().trim().min(2).max(40).optional(),
  active: z.boolean().optional(),
  serviceIds: z.array(cuidSchema).optional(),
});
export type UpdateProfessionalRequest = z.infer<typeof updateProfessionalRequestSchema>;

export const professionalResponseSchema = z.object({
  id: cuidSchema,
  unitId: cuidSchema,
  userId: cuidSchema,
  email: emailSchema,
  fullName: z.string(),
  registry: z.string(),
  active: z.boolean(),
  serviceIds: z.array(cuidSchema),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ProfessionalResponse = z.infer<typeof professionalResponseSchema>;
