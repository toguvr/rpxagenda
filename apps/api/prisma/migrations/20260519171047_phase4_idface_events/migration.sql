-- CreateEnum
CREATE TYPE "IdfaceEventOutcome" AS ENUM ('CHECKIN_OK', 'CHECKIN_OK_REVERTED_NO_SHOW', 'NO_APPOINTMENT_IN_WINDOW', 'PATIENT_NOT_FOUND', 'ALREADY_CHECKED_IN');

-- CreateTable
CREATE TABLE "idface_events" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "idfaceUserId" TEXT NOT NULL,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "accessGranted" BOOLEAN NOT NULL,
    "outcome" "IdfaceEventOutcome" NOT NULL,
    "patientId" TEXT,
    "appointmentId" TEXT,
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idface_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idface_events_unitId_eventAt_idx" ON "idface_events"("unitId", "eventAt");

-- CreateIndex
CREATE INDEX "idface_events_patientId_idx" ON "idface_events"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "idface_events_deviceId_eventAt_idfaceUserId_key" ON "idface_events"("deviceId", "eventAt", "idfaceUserId");

-- AddForeignKey
ALTER TABLE "idface_events" ADD CONSTRAINT "idface_events_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idface_events" ADD CONSTRAINT "idface_events_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idface_events" ADD CONSTRAINT "idface_events_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
