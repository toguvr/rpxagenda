-- Profissional: convite por token (define a própria senha) + permissões de tela.
-- Migration aditiva e não-destrutiva. Faz backfill para não quebrar profissionais
-- já existentes (que continuam com acesso e todas as telas).

-- 1) Novas colunas em professionals (email/allowedScreens) — email entra nullable
--    para permitir o backfill antes de torná-lo obrigatório.
ALTER TABLE "professionals" ADD COLUMN "email" TEXT;
ALTER TABLE "professionals" ADD COLUMN "allowedScreens" TEXT[] NOT NULL DEFAULT '{}';

-- 2) Backfill: copia o email da conta de acesso já vinculada.
UPDATE "professionals" p
SET "email" = u."email"
FROM "users" u
WHERE p."userId" = u."id" AND p."email" IS NULL;

-- 3) Backfill: profissionais existentes ganham TODAS as telas (preserva o
--    comportamento atual, em que o profissional acessava o admin sem restrição).
UPDATE "professionals"
SET "allowedScreens" = ARRAY[
  'dashboard','appointments','patients','plans','finance',
  'services','schedules','equipments','professionals','idface'
]
WHERE "allowedScreens" = '{}';

-- 4) Agora email é obrigatório.
ALTER TABLE "professionals" ALTER COLUMN "email" SET NOT NULL;

-- 5) userId passa a ser nullable (conta de acesso só existe após o resgate do
--    convite). Troca o onDelete de CASCADE para SET NULL.
ALTER TABLE "professionals" DROP CONSTRAINT "professionals_userId_fkey";
ALTER TABLE "professionals" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 6) Tabela de convites do profissional (espelha patient_invites).
CREATE TABLE "professional_invites" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "professional_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "professional_invites_tokenHash_key" ON "professional_invites"("tokenHash");
CREATE INDEX "professional_invites_professionalId_idx" ON "professional_invites"("professionalId");
CREATE INDEX "professional_invites_expiresAt_idx" ON "professional_invites"("expiresAt");

ALTER TABLE "professional_invites" ADD CONSTRAINT "professional_invites_professionalId_fkey"
  FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
