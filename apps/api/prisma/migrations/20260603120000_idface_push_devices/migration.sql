-- Fase iDFace Push: equipamentos por unidade + fila de comandos + ciclo de enrollment.
-- Mudanças não destrutivas para dados existentes (nenhuma linha tem idfaceUserId hoje).

-- CreateEnum
CREATE TYPE "IdfaceEnrollmentStatus" AS ENUM ('PENDING', 'REGISTERED', 'FAILED');

-- CreateEnum
CREATE TYPE "IdfaceCommandStep" AS ENUM ('DESTROY', 'CREATE_USER', 'SET_IMAGE');

-- CreateEnum
CREATE TYPE "IdfaceCommandStatus" AS ENUM ('PENDING', 'DISPATCHED', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "units" ADD COLUMN "nextIdfaceUserId" INTEGER NOT NULL DEFAULT 1000;

-- AlterTable: patients.idfaceUserId vira INTEGER nullable, e a unicidade muda de global para por unidade.
-- (Não há linhas com idfaceUserId não-nulo hoje, então o USING NULL é seguro.)
DROP INDEX "patients_idfaceUserId_key";
ALTER TABLE "patients" ALTER COLUMN "idfaceUserId" DROP NOT NULL;
ALTER TABLE "patients" ALTER COLUMN "idfaceUserId" TYPE INTEGER USING NULL;
CREATE UNIQUE INDEX "patients_unitId_idfaceUserId_key" ON "patients"("unitId", "idfaceUserId");

-- CreateTable
CREATE TABLE "idface_devices" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idface_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idface_enrollments" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "photoKey" TEXT NOT NULL,
    "assignedUserId" INTEGER NOT NULL,
    "status" "IdfaceEnrollmentStatus" NOT NULL DEFAULT 'PENDING',
    "registeredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idface_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idface_commands" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "step" "IdfaceCommandStep" NOT NULL,
    "payload" JSONB NOT NULL,
    "uuid" TEXT NOT NULL,
    "status" "IdfaceCommandStatus" NOT NULL DEFAULT 'PENDING',
    "deviceId" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "response" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idface_commands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "idface_devices_deviceId_key" ON "idface_devices"("deviceId");

-- CreateIndex
CREATE INDEX "idface_devices_unitId_active_idx" ON "idface_devices"("unitId", "active");

-- CreateIndex
CREATE INDEX "idface_enrollments_unitId_status_idx" ON "idface_enrollments"("unitId", "status");

-- CreateIndex
CREATE INDEX "idface_enrollments_patientId_idx" ON "idface_enrollments"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "idface_commands_uuid_key" ON "idface_commands"("uuid");

-- CreateIndex
CREATE INDEX "idface_commands_unitId_status_createdAt_idx" ON "idface_commands"("unitId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "idface_commands_enrollmentId_idx" ON "idface_commands"("enrollmentId");

-- AddForeignKey
ALTER TABLE "idface_devices" ADD CONSTRAINT "idface_devices_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idface_enrollments" ADD CONSTRAINT "idface_enrollments_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idface_enrollments" ADD CONSTRAINT "idface_enrollments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idface_commands" ADD CONSTRAINT "idface_commands_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idface_commands" ADD CONSTRAINT "idface_commands_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "idface_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idface_commands" ADD CONSTRAINT "idface_commands_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
