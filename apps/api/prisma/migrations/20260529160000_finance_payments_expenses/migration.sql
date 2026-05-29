-- Fase financeira (admin-only): recebimentos + despesas. Valores em centavos (BRL).
-- Migration 100% aditiva: novos enums, colunas opcionais e duas tabelas novas.

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'CASH', 'BOLETO', 'BANK_TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'PENDING', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('RENT', 'PAYROLL', 'SUPPLIES', 'EQUIPMENT', 'UTILITIES', 'TAXES', 'MARKETING', 'OTHER');

-- AlterTable
ALTER TABLE "services" ADD COLUMN "suggestedPriceCents" INTEGER;

-- AlterTable
ALTER TABLE "plans" ADD COLUMN "priceCents" INTEGER;

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "planId" TEXT,
    "patientId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PAID',
    "paidAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "description" TEXT,
    "notes" TEXT,
    "pagarmeChargeId" TEXT,
    "rawWebhook" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payments_unitId_status_idx" ON "payments"("unitId", "status");

-- CreateIndex
CREATE INDEX "payments_unitId_paidAt_idx" ON "payments"("unitId", "paidAt");

-- CreateIndex
CREATE INDEX "payments_patientId_idx" ON "payments"("patientId");

-- CreateIndex
CREATE INDEX "payments_planId_idx" ON "payments"("planId");

-- CreateIndex
CREATE INDEX "expenses_unitId_paidAt_idx" ON "expenses"("unitId", "paidAt");

-- CreateIndex
CREATE INDEX "expenses_unitId_category_idx" ON "expenses"("unitId", "category");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
