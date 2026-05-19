-- CreateTable
CREATE TABLE "protocols" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "totalSessions" INTEGER NOT NULL,
    "sessionsPerWeek" INTEGER NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "observations" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "protocols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protocol_equipments" (
    "protocolId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "protocol_equipments_pkey" PRIMARY KEY ("protocolId","equipmentId")
);

-- CreateTable
CREATE TABLE "medical_records" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "content" TEXT NOT NULL,
    "attachmentUrls" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "protocols_unitId_patientId_active_idx" ON "protocols"("unitId", "patientId", "active");

-- CreateIndex
CREATE INDEX "protocols_planId_idx" ON "protocols"("planId");

-- CreateIndex
CREATE INDEX "protocol_equipments_equipmentId_idx" ON "protocol_equipments"("equipmentId");

-- CreateIndex
CREATE INDEX "medical_records_unitId_patientId_createdAt_idx" ON "medical_records"("unitId", "patientId", "createdAt");

-- CreateIndex
CREATE INDEX "medical_records_appointmentId_idx" ON "medical_records"("appointmentId");

-- AddForeignKey
ALTER TABLE "protocols" ADD CONSTRAINT "protocols_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocols" ADD CONSTRAINT "protocols_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocols" ADD CONSTRAINT "protocols_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocols" ADD CONSTRAINT "protocols_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocol_equipments" ADD CONSTRAINT "protocol_equipments_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "protocols"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocol_equipments" ADD CONSTRAINT "protocol_equipments_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
