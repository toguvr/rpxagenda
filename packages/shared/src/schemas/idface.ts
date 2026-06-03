import { z } from 'zod';
import { cuidSchema } from './common';

export const IdfaceEventOutcome = {
  CHECKIN_OK: 'CHECKIN_OK',
  CHECKIN_OK_REVERTED_NO_SHOW: 'CHECKIN_OK_REVERTED_NO_SHOW',
  NO_APPOINTMENT_IN_WINDOW: 'NO_APPOINTMENT_IN_WINDOW',
  PATIENT_NOT_FOUND: 'PATIENT_NOT_FOUND',
  ALREADY_CHECKED_IN: 'ALREADY_CHECKED_IN',
} as const;
export type IdfaceEventOutcome = (typeof IdfaceEventOutcome)[keyof typeof IdfaceEventOutcome];

/**
 * Payload mínimo esperado do equipamento iDFace. Campos extras são preservados
 * em `rawPayload` Json para diagnose mas não interferem na regra.
 */
export const idfaceWebhookPayloadSchema = z
  .object({
    idfaceUserId: z.string().min(1, 'idfaceUserId obrigatório'),
    deviceId: z.string().min(1, 'deviceId obrigatório'),
    /** Instante do evento no relógio do equipamento (ISO 8601 com timezone). */
    timestamp: z.coerce.date(),
  })
  .passthrough();
export type IdfaceWebhookPayload = z.infer<typeof idfaceWebhookPayloadSchema>;

/**
 * Resposta que o equipamento usa para liberar/negar o catracão.
 * Mantemos simples: 200 + accessGranted boolean + outcome.
 */
export const idfaceWebhookResponseSchema = z.object({
  accessGranted: z.boolean(),
  outcome: z.nativeEnum(IdfaceEventOutcome),
  appointmentId: cuidSchema.nullable(),
  message: z.string(),
});
export type IdfaceWebhookResponse = z.infer<typeof idfaceWebhookResponseSchema>;

// ---------- iDFace Device (CRUD admin) ----------

export const createIdfaceDeviceRequestSchema = z.object({
  deviceId: z.string().trim().min(1, 'deviceId obrigatório').max(64, 'deviceId muito longo'),
  name: z.string().trim().min(2, 'Nome muito curto').max(80, 'Nome muito longo'),
  active: z.boolean().default(true),
});
export type CreateIdfaceDeviceRequest = z.infer<typeof createIdfaceDeviceRequestSchema>;

export const updateIdfaceDeviceRequestSchema = createIdfaceDeviceRequestSchema.partial();
export type UpdateIdfaceDeviceRequest = z.infer<typeof updateIdfaceDeviceRequestSchema>;

export const idfaceDeviceResponseSchema = z.object({
  id: cuidSchema,
  unitId: cuidSchema,
  deviceId: z.string(),
  name: z.string(),
  active: z.boolean(),
  lastSeenAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type IdfaceDeviceResponse = z.infer<typeof idfaceDeviceResponseSchema>;

// ---------- iDFace Enrollment (acompanhamento do ciclo) ----------

export const IdfaceEnrollmentStatus = {
  PENDING: 'PENDING',
  REGISTERED: 'REGISTERED',
  FAILED: 'FAILED',
} as const;
export type IdfaceEnrollmentStatus =
  (typeof IdfaceEnrollmentStatus)[keyof typeof IdfaceEnrollmentStatus];

export const idfaceEnrollmentResponseSchema = z.object({
  id: cuidSchema,
  unitId: cuidSchema,
  patientId: cuidSchema,
  assignedUserId: z.number().int(),
  status: z.nativeEnum(IdfaceEnrollmentStatus),
  registeredAt: z.coerce.date().nullable(),
  failedAt: z.coerce.date().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type IdfaceEnrollmentResponse = z.infer<typeof idfaceEnrollmentResponseSchema>;
