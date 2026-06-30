import { z } from 'zod';
import { cuidSchema, emailSchema, passwordSchema } from './common';
import { ALL_SCREEN_KEYS } from '../screens';

/** Aceita apenas keys de tela conhecidas (ver `SCREENS`). */
export const screenKeySchema = z.enum(ALL_SCREEN_KEYS as unknown as [string, ...string[]]);

export const createProfessionalRequestSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(3).max(120),
  registry: z.string().trim().min(2, 'Registro inválido').max(40),
  serviceIds: z.array(cuidSchema).default([]),
  /** Telas do admin que o profissional poderá acessar. */
  allowedScreens: z.array(screenKeySchema).default([]),
  active: z.boolean().default(true),
});
export type CreateProfessionalRequest = z.infer<typeof createProfessionalRequestSchema>;

export const updateProfessionalRequestSchema = z.object({
  fullName: z.string().trim().min(3).max(120).optional(),
  registry: z.string().trim().min(2).max(40).optional(),
  active: z.boolean().optional(),
  serviceIds: z.array(cuidSchema).optional(),
  allowedScreens: z.array(screenKeySchema).optional(),
});
export type UpdateProfessionalRequest = z.infer<typeof updateProfessionalRequestSchema>;

export const professionalResponseSchema = z.object({
  id: cuidSchema,
  unitId: cuidSchema,
  /** Null enquanto o convite não foi resgatado (conta de acesso ainda não criada). */
  userId: cuidSchema.nullable(),
  email: emailSchema,
  fullName: z.string(),
  registry: z.string(),
  active: z.boolean(),
  serviceIds: z.array(cuidSchema),
  allowedScreens: z.array(z.string()),
  /** `true` quando já existe conta de acesso (convite resgatado). */
  hasAccess: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ProfessionalResponse = z.infer<typeof professionalResponseSchema>;

// ---------- Convite do profissional (define a própria senha) ----------

export const professionalInviteResponseSchema = z.object({
  id: cuidSchema,
  professionalId: cuidSchema,
  token: z.string(),
  expiresAt: z.coerce.date(),
  redeemPath: z.string(),
});
export type ProfessionalInviteResponse = z.infer<typeof professionalInviteResponseSchema>;

export const professionalInviteLookupResponseSchema = z.object({
  professional: z.object({
    fullName: z.string(),
    email: emailSchema,
    registry: z.string(),
  }),
  expiresAt: z.coerce.date(),
});
export type ProfessionalInviteLookupResponse = z.infer<
  typeof professionalInviteLookupResponseSchema
>;

export const redeemProfessionalInviteRequestSchema = z.object({
  password: passwordSchema,
});
export type RedeemProfessionalInviteRequest = z.infer<typeof redeemProfessionalInviteRequestSchema>;
