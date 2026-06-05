-- Correlação do protocolo Push da ControliD: o device gera seu próprio uuid
-- no GET /push?uuid=... e o devolve no POST /result. Guardamos esse uuid no
-- comando que foi entregue nesse poll para casar o resultado de volta.
ALTER TABLE "idface_commands" ADD COLUMN "dispatchUuid" TEXT;

CREATE INDEX "idface_commands_dispatchUuid_idx" ON "idface_commands"("dispatchUuid");
