/* eslint-disable no-console */
import { PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const INSECURE_DEFAULTS = {
  SEED_ADMIN_EMAIL: 'admin@rpxexpert.local',
  SEED_ADMIN_PASSWORD: 'RpxAdmin@2026',
};
// E-mail: paciente.smoke14@example.com
// Senha: Paciente@2026
function readEnv(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value && value.trim().length > 0) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Variável de ambiente obrigatória ausente: ${key}`);
}

function assertSafeForNonDev(
  nodeEnv: string,
  key: keyof typeof INSECURE_DEFAULTS,
  effective: string,
): void {
  if (nodeEnv === 'development') return;
  if (effective === INSECURE_DEFAULTS[key]) {
    throw new Error(
      `[seed] ${key} usa o valor default de desenvolvimento em NODE_ENV=${nodeEnv}. ` +
        `Defina ${key} explicitamente no environment antes de rodar o seed fora de development.`,
    );
  }
}

async function main(): Promise<void> {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const unitName = readEnv('SEED_UNIT_NAME', 'RPX Expert — Matriz');
  const timezone = readEnv('SEED_UNIT_TIMEZONE', 'America/Sao_Paulo');
  const adminEmail = readEnv('SEED_ADMIN_EMAIL', INSECURE_DEFAULTS.SEED_ADMIN_EMAIL)
    .toLowerCase()
    .trim();
  const adminPassword = readEnv('SEED_ADMIN_PASSWORD', INSECURE_DEFAULTS.SEED_ADMIN_PASSWORD);
  const adminFullName = readEnv('SEED_ADMIN_FULL_NAME', 'Administrador RPX');

  assertSafeForNonDev(nodeEnv, 'SEED_ADMIN_EMAIL', adminEmail);
  assertSafeForNonDev(nodeEnv, 'SEED_ADMIN_PASSWORD', adminPassword);

  // Idempotência da unidade: como name não é unique, buscamos por (name, timezone) e criamos se ausente.
  const existingUnit = await prisma.unit.findFirst({
    where: { name: unitName, timezone },
  });
  const unit = existingUnit
    ? existingUnit
    : await prisma.unit.create({ data: { name: unitName, timezone } });

  console.log(
    `[seed] unidade ${existingUnit ? 'já existente' : 'criada'}: ${unit.name} (${unit.id})`,
  );

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existingAdmin) {
    console.log(`[seed] admin já existe: ${existingAdmin.email} (${existingAdmin.id})`);
  } else {
    const passwordHash = await argon2.hash(adminPassword, { type: argon2.argon2id });
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        fullName: adminFullName,
        role: UserRole.ADMIN,
        unitId: unit.id,
      },
    });
    console.log(`[seed] admin criado: ${admin.email} (${admin.id})`);
  }
}

main()
  .catch((err) => {
    console.error('[seed] erro:', err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
