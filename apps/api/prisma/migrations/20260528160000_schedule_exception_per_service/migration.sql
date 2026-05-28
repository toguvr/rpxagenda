-- Exceções de calendário agora podem ser por serviço (serviceId setado) ou da
-- unidade inteira (serviceId NULL). Troca a unicidade (unitId, date) por
-- (unitId, date, serviceId) para permitir uma exceção por serviço além da global.
ALTER TABLE "schedule_exceptions" ADD COLUMN "serviceId" TEXT;

DROP INDEX "schedule_exceptions_unitId_date_key";

CREATE UNIQUE INDEX "schedule_exceptions_unitId_date_serviceId_key"
  ON "schedule_exceptions"("unitId", "date", "serviceId");

ALTER TABLE "schedule_exceptions"
  ADD CONSTRAINT "schedule_exceptions_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "services"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
