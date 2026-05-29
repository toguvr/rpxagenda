-- Item 1: agendamento avulso (sem plano) — planId passa a ser opcional.
ALTER TABLE "appointments" ALTER COLUMN "planId" DROP NOT NULL;

-- Item 2: protocolo pode referenciar o agendamento de avaliação que o originou.
ALTER TABLE "protocols" ADD COLUMN "appointmentId" TEXT;

CREATE INDEX "protocols_appointmentId_idx" ON "protocols"("appointmentId");

ALTER TABLE "protocols"
  ADD CONSTRAINT "protocols_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
