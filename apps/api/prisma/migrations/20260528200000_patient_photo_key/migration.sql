-- Foto do paciente: guarda só a object key do S3 (URL é assinada sob demanda).
ALTER TABLE "patients" ADD COLUMN "photoKey" TEXT;
