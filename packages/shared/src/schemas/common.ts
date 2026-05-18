import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5, 'E-mail inválido')
  .max(254, 'E-mail muito longo')
  .email('E-mail inválido');

export const passwordSchema = z
  .string()
  .min(8, 'Senha deve ter ao menos 8 caracteres')
  .max(128, 'Senha muito longa');

export const cuidSchema = z.string().min(1, 'ID inválido');
