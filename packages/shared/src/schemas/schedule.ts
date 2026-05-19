import { z } from 'zod';
import { cuidSchema } from './common';

/** HH:MM (24h). */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário deve estar no formato HH:MM (24h)');

export const weekdaySchema = z.number().int().min(0).max(6);

/**
 * Cada serviço tem sua própria grade — a rota é POST /services/:serviceId/business-hours,
 * e serviceId vem da URL, não do body.
 */
export const createBusinessHoursRequestSchema = z
  .object({
    weekday: weekdaySchema,
    opensAt: timeOfDaySchema,
    closesAt: timeOfDaySchema,
  })
  .refine((v) => v.opensAt < v.closesAt, {
    message: 'closesAt deve ser maior que opensAt',
    path: ['closesAt'],
  });
export type CreateBusinessHoursRequest = z.infer<typeof createBusinessHoursRequestSchema>;

export const businessHoursResponseSchema = z.object({
  id: cuidSchema,
  unitId: cuidSchema,
  serviceId: cuidSchema,
  weekday: weekdaySchema,
  opensAt: z.string(),
  closesAt: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type BusinessHoursResponse = z.infer<typeof businessHoursResponseSchema>;

export const ScheduleExceptionType = {
  CLOSED: 'CLOSED',
  CUSTOM: 'CUSTOM',
} as const;
export type ScheduleExceptionType =
  (typeof ScheduleExceptionType)[keyof typeof ScheduleExceptionType];

export const createScheduleExceptionRequestSchema = z
  .object({
    date: z.coerce.date(),
    type: z.nativeEnum(ScheduleExceptionType),
    opensAt: timeOfDaySchema.optional(),
    closesAt: timeOfDaySchema.optional(),
    reason: z.string().trim().max(200).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'CUSTOM') {
      if (!v.opensAt || !v.closesAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Exceções CUSTOM exigem opensAt e closesAt',
          path: ['type'],
        });
        return;
      }
      if (v.opensAt >= v.closesAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'closesAt deve ser maior que opensAt',
          path: ['closesAt'],
        });
      }
    }
  });
export type CreateScheduleExceptionRequest = z.infer<typeof createScheduleExceptionRequestSchema>;

export const scheduleExceptionResponseSchema = z.object({
  id: cuidSchema,
  unitId: cuidSchema,
  date: z.coerce.date(),
  type: z.nativeEnum(ScheduleExceptionType),
  opensAt: z.string().nullable(),
  closesAt: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ScheduleExceptionResponse = z.infer<typeof scheduleExceptionResponseSchema>;

// ---------- slots ----------

export const slotSchema = z.object({
  /** Início do slot em ISO 8601 UTC. */
  startsAt: z.coerce.date(),
  /** Fim do slot em ISO 8601 UTC. */
  endsAt: z.coerce.date(),
  /** Representação amigável no fuso da unidade (HH:MM). */
  localStart: z.string(),
  localEnd: z.string(),
});
export type Slot = z.infer<typeof slotSchema>;
