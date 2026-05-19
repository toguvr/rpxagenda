-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScheduleExceptionType" AS ENUM ('CLOSED', 'CUSTOM');

-- CreateTable
CREATE TABLE "business_hours" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "opensAt" TEXT NOT NULL,
    "closesAt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_exceptions" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "ScheduleExceptionType" NOT NULL,
    "opensAt" TEXT,
    "closesAt" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "type" "PlanType" NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "totalSessions" INTEGER,
    "remainingSessions" INTEGER,
    "validUntil" TIMESTAMP(3),
    "weeklyQuota" INTEGER,
    "pagarmeSubscriptionId" TEXT,
    "nextBillingAt" TIMESTAMP(3),
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_hours_unitId_weekday_idx" ON "business_hours"("unitId", "weekday");

-- CreateIndex
CREATE INDEX "schedule_exceptions_unitId_date_idx" ON "schedule_exceptions"("unitId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_exceptions_unitId_date_key" ON "schedule_exceptions"("unitId", "date");

-- CreateIndex
CREATE INDEX "plans_unitId_patientId_status_idx" ON "plans"("unitId", "patientId", "status");

-- CreateIndex
CREATE INDEX "plans_unitId_serviceId_status_idx" ON "plans"("unitId", "serviceId", "status");

-- AddForeignKey
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
