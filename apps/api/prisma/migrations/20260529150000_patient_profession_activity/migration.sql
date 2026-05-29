-- Campos opcionais do paciente: profissão e atividade.
ALTER TABLE "patients" ADD COLUMN "profession" TEXT;
ALTER TABLE "patients" ADD COLUMN "activity" TEXT;
