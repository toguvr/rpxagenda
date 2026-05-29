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
  /** Profissão do paciente (opcional). */
  profession: z.string().trim().max(120).optional(),
  /** Atividade física / ocupacional (opcional). */
  activity: z.string().trim().max(200).optional(),
  /** Apelido/referência interna — só ADMIN pode definir e visualizar. */
  adminReference: z.string().trim().max(200).optional(),
});
export type CreatePatientRequest = z.infer<typeof createPatientRequestSchema>;

export const updatePatientRequestSchema = createPatientRequestSchema.partial();
export type UpdatePatientRequest = z.infer<typeof updatePatientRequestSchema>;

// ---------- foto (upload via S3 presigned) ----------

/** Solicita uma URL assinada de upload (PUT) para a foto do paciente. */
export const photoUploadUrlRequestSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});
export type PhotoUploadUrlRequest = z.infer<typeof photoUploadUrlRequestSchema>;

export const photoUploadUrlResponseSchema = z.object({
  /** Object key gerada pelo backend — o cliente devolve depois para confirmar. */
  key: z.string(),
  /** URL assinada para PUT direto no S3 (expira em poucos minutos). */
  uploadUrl: z.string().url(),
});
export type PhotoUploadUrlResponse = z.infer<typeof photoUploadUrlResponseSchema>;

/** Confirma a foto após o upload concluir no S3. */
export const savePatientPhotoRequestSchema = z.object({
  key: z.string().min(1),
});
export type SavePatientPhotoRequest = z.infer<typeof savePatientPhotoRequestSchema>;

export const patientPhotoUrlResponseSchema = z.object({
  /** URL assinada de leitura (GET), ou null se o paciente não tem foto. */
  url: z.string().url().nullable(),
});
export type PatientPhotoUrlResponse = z.infer<typeof patientPhotoUrlResponseSchema>;

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
  profession: z.string().nullable(),
  activity: z.string().nullable(),
  /** Preenchido apenas para ADMIN; `null` para PROFESSIONAL/PATIENT. */
  adminReference: z.string().nullable(),
  /** Object key da foto no S3 (null = sem foto). A URL é obtida via endpoint de foto. */
  photoKey: z.string().nullable(),
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
