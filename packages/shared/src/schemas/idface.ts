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
