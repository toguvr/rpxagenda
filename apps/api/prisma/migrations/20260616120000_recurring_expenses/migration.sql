-- Gastos fixos (despesas recorrentes) + vínculo de origem nas despesas geradas.
-- Migration aditiva e não-destrutiva.

-- 1) Tabela de gastos fixos.
CREATE TABLE "recurring_expenses" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "variableAmount" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "lastGeneratedPeriod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_expenses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recurring_expenses_unitId_active_idx" ON "recurring_expenses"("unitId", "active");

ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2) Origem nas despesas: aponta para o gasto fixo + mês de competência.
ALTER TABLE "expenses" ADD COLUMN "recurringExpenseId" TEXT;
ALTER TABLE "expenses" ADD COLUMN "period" TEXT;

-- 1 geração por gasto fixo por mês (NULLs não conflitam → despesas avulsas livres).
CREATE UNIQUE INDEX "expenses_recurringExpenseId_period_key"
  ON "expenses"("recurringExpenseId", "period");

ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recurringExpenseId_fkey"
  FOREIGN KEY ("recurringExpenseId") REFERENCES "recurring_expenses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
