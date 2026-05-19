import { z } from 'zod';
import { cuidSchema } from './common';

export const createMedicalRecordRequestSchema = z.object({
  patientId: cuidSchema,
  appointmentId: cuidSchema.optional(),
  content: z.string().trim().min(1, 'Conteúdo não pode ser vazio').max(20_000),
  attachmentUrls: z
    .array(z.string().url('attachmentUrls deve conter URLs válidas'))
    .max(20)
    .default([]),
});
export type CreateMedicalRecordRequest = z.infer<typeof createMedicalRecordRequestSchema>;

export const updateMedicalRecordRequestSchema = z.object({
  content: z.string().trim().min(1).max(20_000).optional(),
  attachmentUrls: z.array(z.string().url()).max(20).optional(),
});
export type UpdateMedicalRecordRequest = z.infer<typeof updateMedicalRecordRequestSchema>;

export const medicalRecordResponseSchema = z.object({
  id: cuidSchema,
  unitId: cuidSchema,
  patientId: cuidSchema,
  professionalId: cuidSchema,
  appointmentId: cuidSchema.nullable(),
  content: z.string(),
  attachmentUrls: z.array(z.string()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type MedicalRecordResponse = z.infer<typeof medicalRecordResponseSchema>;
