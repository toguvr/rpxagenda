import { z } from 'zod';
import { isValidCpf, normalizeCpf } from '../cpf';
import { cuidSchema, emailSchema, passwordSchema } from './common';

const cpfSchema = z
  .string()
  .transform((v) => normalizeCpf(v))
  .refine((v) => isValidCpf(v), 'CPF inválido');

const phoneSchema = z
  .string()
  .trim()
  .min(8, 'Telefone muito curto')
  .max(20, 'Telefone muito longo');

const isoDateSchema = z.coerce.date();

export const createPatientRequestSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  cpf: cpfSchema,
  birthDate: isoDateSchema,
  phone: phoneSchema,
  email: emailSchema.optional(),
  emergencyContact: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
  /** Apelido/referência interna — só ADMIN pode definir e visualizar. */
  adminReference: z.string().trim().max(200).optional(),
});
export type CreatePatientRequest = z.infer<typeof createPatientRequestSchema>;

export const updatePatientRequestSchema = createPatientRequestSchema.partial();
export type UpdatePatientRequest = z.infer<typeof updatePatientRequestSchema>;

export const patientResponseSchema = z.object({
  id: cuidSchema,
  unitId: cuidSchema,
  userId: cuidSchema.nullable(),
  fullName: z.string(),
  cpf: z.string(),
  birthDate: z.coerce.date(),
  phone: z.string(),
  email: emailSchema.nullable(),
  emergencyContact: z.string().nullable(),
  notes: z.string().nullable(),
  /** Preenchido apenas para ADMIN; `null` para PROFESSIONAL/PATIENT. */
  adminReference: z.string().nullable(),
  hasIdfaceEnrolled: z.boolean(),
  hasUserAccount: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type PatientResponse = z.infer<typeof patientResponseSchema>;

// ---------- convite ----------

export const inviteResponseSchema = z.object({
  id: cuidSchema,
  patientId: cuidSchema,
  token: z.string(),
  expiresAt: z.coerce.date(),
  redeemPath: z.string(),
});
export type InviteResponse = z.infer<typeof inviteResponseSchema>;

export const inviteLookupResponseSchema = z.object({
  patient: z.object({
    fullName: z.string(),
    email: emailSchema.nullable(),
    cpf: z.string(),
  }),
  expiresAt: z.coerce.date(),
});
export type InviteLookupResponse = z.infer<typeof inviteLookupResponseSchema>;

export const redeemInviteRequestSchema = z.object({
  password: passwordSchema,
});
export type RedeemInviteRequest = z.infer<typeof redeemInviteRequestSchema>;
