-- Avaliação não exige plano comercial: planId do protocolo passa a ser opcional.
ALTER TABLE "protocols" ALTER COLUMN "planId" DROP NOT NULL;
