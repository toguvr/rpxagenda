import { z } from 'zod';
import { cuidSchema } from './common';

export const createEquipmentRequestSchema = z.object({
  name: z.string().trim().min(2, 'Nome muito curto').max(80, 'Nome muito longo'),
  totalQuantity: z.number().int().positive().max(1000).default(1),
  active: z.boolean().default(true),
});
export type CreateEquipmentRequest = z.infer<typeof createEquipmentRequestSchema>;

export const updateEquipmentRequestSchema = createEquipmentRequestSchema.partial();
export type UpdateEquipmentRequest = z.infer<typeof updateEquipmentRequestSchema>;

export const equipmentResponseSchema = z.object({
  id: cuidSchema,
  unitId: cuidSchema,
  name: z.string(),
  totalQuantity: z.number().int(),
  active: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type EquipmentResponse = z.infer<typeof equipmentResponseSchema>;

export const setServiceEquipmentsRequestSchema = z.object({
  equipmentIds: z.array(cuidSchema),
});
export type SetServiceEquipmentsRequest = z.infer<typeof setServiceEquipmentsRequestSchema>;
