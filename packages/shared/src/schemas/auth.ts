import { z } from 'zod';
import { UserRole } from '../enums';
import { emailSchema, passwordSchema, cuidSchema } from './common';

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(20, 'Refresh token inválido'),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const forgotPasswordRequestSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

export const resetPasswordRequestSchema = z.object({
  token: z.string().min(20, 'Token inválido'),
  password: passwordSchema,
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export const authenticatedUserSchema = z.object({
  id: cuidSchema,
  email: emailSchema,
  fullName: z.string().min(1),
  role: z.nativeEnum(UserRole),
  unitId: cuidSchema,
});
export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: authenticatedUserSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;
