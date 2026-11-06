-- Acesso de profissionais pelo totem iDFace.
-- Profissional ganha foto + idfaceUserId (cadastro facial pelo admin, mesma fila
-- Push dos pacientes) e passa a ser liberado no totem a qualquer hora.
-- Mudanças apenas aditivas: novas colunas anuláveis, novo valor de enum e
-- relaxamento de NOT NULL. Nenhuma linha existente é alterada.

-- AlterEnum
ALTER TYPE "IdfaceEventOutcome" ADD VALUE 'PROFESSIONAL_ACCESS';

-- AlterTable: professionals
ALTER TABLE "professionals" ADD COLUMN "photoKey" TEXT;
ALTER TABLE "professionals" ADD COLUMN "idfaceUserId" INTEGER;
CREATE UNIQUE INDEX "professionals_unitId_idfaceUserId_key" ON "professionals"("unitId", "idfaceUserId");

-- AlterTable: idface_events
ALTER TABLE "idface_events" ADD COLUMN "professionalId" TEXT;
CREATE INDEX "idface_events_professionalId_idx" ON "idface_events"("professionalId");
ALTER TABLE "idface_events" ADD CONSTRAINT "idface_events_professionalId_fkey"
  FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: idface_enrollments (dono = paciente OU profissional)
ALTER TABLE "idface_enrollments" ALTER COLUMN "patientId" DROP NOT NULL;
ALTER TABLE "idface_enrollments" ADD COLUMN "professionalId" TEXT;
CREATE INDEX "idface_enrollments_professionalId_idx" ON "idface_enrollments"("professionalId");
ALTER TABLE "idface_enrollments" ADD CONSTRAINT "idface_enrollments_professionalId_fkey"
  FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "idface_enrollments" ADD CONSTRAINT "idface_enrollments_owner_check"
  CHECK (("patientId" IS NOT NULL) <> ("professionalId" IS NOT NULL));

-- AlterTable: idface_commands (mesmo dono do enrollment)
ALTER TABLE "idface_commands" ALTER COLUMN "patientId" DROP NOT NULL;
ALTER TABLE "idface_commands" ADD COLUMN "professionalId" TEXT;
ALTER TABLE "idface_commands" ADD CONSTRAINT "idface_commands_professionalId_fkey"
  FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "idface_commands" ADD CONSTRAINT "idface_commands_owner_check"
  CHECK (("patientId" IS NOT NULL) <> ("professionalId" IS NOT NULL));
