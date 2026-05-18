/* eslint-disable no-console */
import { PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

function readEnv(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value && value.trim().length > 0) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Variável de ambiente obrigatória ausente: ${key}`);
}

async function main(): Promise<void> {
  const unitName = readEnv('SEED_UNIT_NAME', 'RPX Expert — Matriz');
  const timezone = readEnv('SEED_UNIT_TIMEZONE', 'America/Sao_Paulo');
  const adminEmail = readEnv('SEED_ADMIN_EMAIL', 'admin@rpxexpert.local').toLowerCase().trim();
  const adminPassword = readEnv('SEED_ADMIN_PASSWORD', 'RpxAdmin@2026');
  const adminFullName = readEnv('SEED_ADMIN_FULL_NAME', 'Administrador RPX');

  // Idempotência da unidade: como name não é unique, buscamos por (name, timezone) e criamos se ausente.
  const existingUnit = await prisma.unit.findFirst({
    where: { name: unitName, timezone },
  });
  const unit = existingUnit
    ? existingUnit
    : await prisma.unit.create({ data: { name: unitName, timezone } });

  console.log(`[seed] unidade ${existingUnit ? 'já existente' : 'criada'}: ${unit.name} (${unit.id})`);

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
    console.error('[seed] erro:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
