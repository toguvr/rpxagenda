/*
  Warnings:

  - Added the required column `serviceId` to the `business_hours` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "business_hours_unitId_weekday_idx";

-- AlterTable
ALTER TABLE "business_hours" ADD COLUMN     "serviceId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "business_hours_unitId_serviceId_weekday_idx" ON "business_hours"("unitId", "serviceId", "weekday");

-- AddForeignKey
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
