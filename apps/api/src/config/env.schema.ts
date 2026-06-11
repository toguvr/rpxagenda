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

  // Defaults só valem em development. Em test/production, o seed exige valores explícitos
  // (validação adicional em prisma/seed.ts), evitando credenciais previsíveis em prod.
  SEED_UNIT_NAME: z.string().min(1).default('RPX Expert — Matriz'),
  SEED_UNIT_TIMEZONE: z.string().min(1).default('America/Sao_Paulo'),
  SEED_ADMIN_EMAIL: z.string().email().default('admin@rpxexpert.local'),
  SEED_ADMIN_PASSWORD: z.string().min(8).default('RpxAdmin@2026'),
  SEED_ADMIN_FULL_NAME: z.string().min(1).default('Administrador RPX'),

  /**
   * Segredo compartilhado que o equipamento iDFace envia no header
   * `X-IDFace-Secret`. Default fraco apenas para dev; em produção o ConfigModule
   * recusa qualquer valor abaixo de 16 chars na boot (validação adicional em
   * IdfaceWebhookGuard).
   */
  IDFACE_WEBHOOK_SECRET: z.string().min(8).default('dev-idface-secret-trocar-em-prod'),

  // Storage S3 para fotos de pacientes. Sem S3_BUCKET, o upload fica desabilitado
  // (endpoints respondem com erro claro). Credenciais vêm da cadeia padrão do AWS SDK
  // (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY no environment) ou de role anexada.
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),

  // E-mail (AWS SES). Sem SES_FROM_EMAIL o envio fica desabilitado (apenas logado).
  // O remetente precisa ser uma identidade verificada no SES. Credenciais vêm da
  // cadeia padrão do AWS SDK (mesmas chaves do S3) e precisam de ses:SendEmail.
  SES_FROM_EMAIL: z.string().email().optional(),
  SES_REGION: z.string().default('us-east-1'),
  // URL pública do admin, usada para montar o link de resgate do convite no e-mail.
  ADMIN_PUBLIC_URL: z.string().url().default('http://localhost:4000'),

  // Gate de versão do app mobile (forced update). `MOBILE_MIN_VERSION` é a versão
  // mínima suportada (semver): abaixo dela o app mostra tela de atualização
  // obrigatória. Default 0.0.0 = nunca força. As URLs alimentam o botão "Atualizar".
  MOBILE_MIN_VERSION: z.string().default('0.0.0'),
  MOBILE_LATEST_VERSION: z.string().default('0.0.0'),
  MOBILE_IOS_URL: z.string().default(''),
  MOBILE_ANDROID_URL: z
    .string()
    .default('https://play.google.com/store/apps/details?id=com.rpxexpert.app'),
});

/**
 * Valores default das variáveis SEED_*. Em ambientes não-dev o seed exige que os valores
 * efetivos venham do environment, recusando estes defaults.
 */
export const INSECURE_SEED_DEFAULTS = {
  SEED_ADMIN_EMAIL: 'admin@rpxexpert.local',
  SEED_ADMIN_PASSWORD: 'RpxAdmin@2026',
} as const;

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
