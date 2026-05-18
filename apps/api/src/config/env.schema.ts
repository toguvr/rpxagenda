import { z } from 'zod';

const minSecret = 32;

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().url('DATABASE_URL deve ser uma URL válida'),

  JWT_ACCESS_SECRET: z
    .string()
    .min(minSecret, `JWT_ACCESS_SECRET deve ter pelo menos ${minSecret} caracteres`),
  JWT_REFRESH_SECRET: z
    .string()
    .min(minSecret, `JWT_REFRESH_SECRET deve ter pelo menos ${minSecret} caracteres`),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),

  SEED_UNIT_NAME: z.string().min(1).default('RPX Expert — Matriz'),
  SEED_UNIT_TIMEZONE: z.string().min(1).default('America/Sao_Paulo'),
  SEED_ADMIN_EMAIL: z.string().email().default('admin@rpxexpert.local'),
  SEED_ADMIN_PASSWORD: z.string().min(8).default('RpxAdmin@2026'),
  SEED_ADMIN_FULL_NAME: z.string().min(1).default('Administrador RPX'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${issues}`);
  }
  return parsed.data;
}
