-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('FISIO', 'MUSCULACAO', 'RPG', 'PILATES', 'AVALIACAO');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('PACKAGE', 'SUBSCRIPTION');

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ServiceType" NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "slotCapacity" INTEGER NOT NULL DEFAULT 1,
    "cancellationLeadMinutes" INTEGER NOT NULL DEFAULT 240,
    "schedulingLeadMinutes" INTEGER NOT NULL DEFAULT 60,
    "checkInWindowBeforeMin" INTEGER NOT NULL DEFAULT 30,
    "checkInWindowAfterMin" INTEGER NOT NULL DEFAULT 15,
    "acceptedPlanType" "PlanType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipments" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalQuantity" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_equipments" (
    "serviceId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_equipments_pkey" PRIMARY KEY ("serviceId","equipmentId")
);

-- CreateTable
CREATE TABLE "professionals" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "registry" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "professionals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional_services" (
    "professionalId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "professional_services_pkey" PRIMARY KEY ("professionalId","serviceId")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "userId" TEXT,
    "fullName" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "emergencyContact" TEXT,
    "notes" TEXT,
    "idfaceUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_invites" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "services_unitId_active_idx" ON "services"("unitId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "services_unitId_name_key" ON "services"("unitId", "name");

-- CreateIndex
CREATE INDEX "equipments_unitId_active_idx" ON "equipments"("unitId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "equipments_unitId_name_key" ON "equipments"("unitId", "name");

-- CreateIndex
CREATE INDEX "service_equipments_equipmentId_idx" ON "service_equipments"("equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "professionals_userId_key" ON "professionals"("userId");

-- CreateIndex
CREATE INDEX "professionals_unitId_active_idx" ON "professionals"("unitId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "professionals_unitId_registry_key" ON "professionals"("unitId", "registry");

-- CreateIndex
CREATE INDEX "professional_services_serviceId_idx" ON "professional_services"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "patients_userId_key" ON "patients"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "patients_idfaceUserId_key" ON "patients"("idfaceUserId");

-- CreateIndex
CREATE INDEX "patients_unitId_fullName_idx" ON "patients"("unitId", "fullName");

-- CreateIndex
CREATE UNIQUE INDEX "patients_unitId_cpf_key" ON "patients"("unitId", "cpf");

-- CreateIndex
CREATE UNIQUE INDEX "patient_invites_tokenHash_key" ON "patient_invites"("tokenHash");

-- CreateIndex
CREATE INDEX "patient_invites_patientId_idx" ON "patient_invites"("patientId");

-- CreateIndex
CREATE INDEX "patient_invites_expiresAt_idx" ON "patient_invites"("expiresAt");

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipments" ADD CONSTRAINT "equipments_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_equipments" ADD CONSTRAINT "service_equipments_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_equipments" ADD CONSTRAINT "service_equipments_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_services" ADD CONSTRAINT "professional_services_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_services" ADD CONSTRAINT "professional_services_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_invites" ADD CONSTRAINT "patient_invites_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
