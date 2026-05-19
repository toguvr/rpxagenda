# Sessão 05 — Fase 3 completa (no-show, status transitions, integration tests)

Data: 2026-05-19
Branch: `main`
Escopo: fechar a [Fase 3](CLAUDE.md#10-roadmap-de-implementação-alto-nível) — adicionar o que faltou após a Sessão 04 (núcleo de agendamento básico): detecção automática de no-show, transições de status (confirm/check-in/complete) e integration tests cobrindo race conditions reais contra Postgres.

---

## 1. Entregue

### 1.1 Schema

- `Service.noShowGraceMinutes Int @default(15)` — janela após `endsAt` em que o job ainda aguarda o check-in antes de marcar `NO_SHOW`. Migration `phase3_noshow_grace`.

### 1.2 No-show cron (`NoShowService`)

- `@nestjs/schedule` adicionado como dep, `ScheduleModule.forRoot()` no `AppointmentsModule`.
- `@Cron(CronExpression.EVERY_5_MINUTES)` em `NoShowService.handleCron()`.
- O cron abre um `cls.run` + `runWithoutUnitScope` — roda **cross-tenant** (todas as unidades).
- `runNoShowSweep(now?)` exposto público para testes/disparo manual; retorna IDs marcados.
- **Filtro puro** `filterNoShowCandidates(rows, now)` extraído para teste fácil — 4 unit tests cobrindo: marca elegíveis, respeita `grace` por serviço, `grace=0`, lista vazia.
- `AuditLog action='APPOINTMENT_AUTO_NO_SHOW', actorId=null` para cada appointment marcado.
- Transação única que atualiza todos os rows + escreve audit, atômico.

### 1.3 Status transitions (3 endpoints novos)

| Método | Path                         | De                      | Para                         | Quem                     |
| ------ | ---------------------------- | ----------------------- | ---------------------------- | ------------------------ |
| `POST` | `/appointments/:id/confirm`  | `SCHEDULED`             | `CONFIRMED`                  | ADMIN, PATIENT (próprio) |
| `POST` | `/appointments/:id/check-in` | `SCHEDULED`/`CONFIRMED` | `CHECKED_IN` + `checkedInAt` | ADMIN, PROFESSIONAL      |
| `POST` | `/appointments/:id/complete` | `CHECKED_IN`            | `COMPLETED` + `completedAt`  | ADMIN, PROFESSIONAL      |

- Helper privado `transition()`: idempotente (já está no destino → no-op), bloqueia transições inválidas com 409, grava AuditLog (`APPOINTMENT_CONFIRMED` / `APPOINTMENT_CHECKED_IN` / `APPOINTMENT_COMPLETED`) com `before`/`after`.

### 1.4 Retry de serialization failure no `create`

Bug encontrado pelos integration tests: sob `SERIALIZABLE`, 5 requests concorrentes lendo o mesmo snapshot vazio tentam inserir e **apenas 1 commita por rodada** — os outros 4 recebem `P2034`. Sem retry, isso significa que slotCapacity > 1 nunca seria honrado sob concorrência real.

Fix: loop com `MAX_ATTEMPTS=5` em torno do `$transaction`, com backoff jitter de 10-50ms entre tentativas. Cada retry re-coleta o snapshot (agora vendo as inserções já commitadas das tentativas vencedoras) e re-valida; quando a capacidade real é atingida, o `validateAppointment` retorna `SLOT_FULL` e o retry para. Apenas falhas P2034 são retry-elegíveis — `AppointmentValidationException` propaga imediatamente.

### 1.5 Integration tests (apps/api/src/modules/appointments/appointments.integration.spec.ts)

**Sobe o NestJS completo** (`Test.createTestingModule({ imports: [AppModule] })`) contra o Postgres real do dev (5433). Estratégia:

- `beforeAll`: boot app, pega `PrismaService` + `NoShowService`, faz login admin.
- Helper `clearTestData()` antes de cada caso: deleta tudo respeitando FKs, preserva Unit + admin User.
- Helpers de fixture (`seedSlotEnv`, `seedManyPatientsForSlot`) criam Service/Patient/Plan limpos por caso.

**4 testes** (todos passing contra DB real):

| #   | Cenário                                                        | Verificação                                                                    |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | 5 POST paralelos em slot com `slotCapacity=1`                  | 1 status 201 + 4 status 409; `appointment.count = 1`                           |
| 2   | 5 POST paralelos em slot com `slotCapacity=3`                  | **3 status 201 + 2 status 409** (retry valida que slotCap>1 funciona sob race) |
| 3   | `runNoShowSweep` marca appointment cujo endsAt+grace já passou | Status vira `NO_SHOW`; AuditLog `APPOINTMENT_AUTO_NO_SHOW` gravado             |
| 4   | `runNoShowSweep` NÃO marca dentro do grace                     | Status segue `SCHEDULED`                                                       |

---

## 2. Smoke test ponta-a-ponta (manual)

Transições verificadas com appointment criado, confirmado, checked-in, completado:

```
1. POST /appointments → SCHEDULED, consumedSession=true
2. POST /appointments/:id/confirm → CONFIRMED
3. POST /appointments/:id/check-in → CHECKED_IN + checkedInAt setado
4. POST /appointments/:id/complete → COMPLETED + completedAt setado
5. POST /appointments/:id/confirm (em COMPLETED) → 409 "Transição de COMPLETED para CONFIRMED não é permitida"
```

---

## 3. Stats da sessão

| Métrica         | Antes | Agora                                    |
| --------------- | ----- | ---------------------------------------- |
| Endpoints       | 39    | **42** (+3 transitions)                  |
| Modelos Prisma  | 15    | 15                                       |
| Migrations      | 6     | **7** (+phase3_noshow_grace)             |
| Testes          | 78    | **86** (+4 no-show pure + 4 integration) |
| Suites de teste | 7     | **9**                                    |

Commits: 2 (Fase 3 completa + SESSION-05-REPORT).

---

## 4. Decisões técnicas

| Decisão                           | Escolha                                       | Por quê                                                                                                                                                                        |
| --------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Default `noShowGraceMinutes`      | 15min (configurável por serviço)              | Espelha o spec do CLAUDE.md §4.5.                                                                                                                                              |
| Cron de no-show                   | `@nestjs/schedule` com `@Cron('*/5 * * * *')` | Built-in, sem dep externa de queue. Cron simples roda no mesmo processo da API; ok para single-instance dev/staging. Para multi-instance produção, virar lock leader-election. |
| Retry de SERIALIZABLE             | Loop até 5 tentativas com jitter 10-50ms      | Padrão para resolver `P2034` no Postgres serializable. Backoff curto evita estouro de latency p99 mas dá tempo de outros commitsterminarem.                                    |
| Cron cross-tenant                 | `runWithoutUnitScope` dentro de `cls.run`     | Background não tem unitId; precisa opt-out da extensão de tenant para enxergar appointments de todas as unidades.                                                              |
| Idempotência das transitions      | Já está no destino → return sem update        | Evita escrever AuditLog duplicado; UI pode chamar o endpoint múltiplas vezes sem efeito colateral.                                                                             |
| `import request from 'supertest'` | Default import (não `* as`)                   | Com `esModuleInterop`, default import funciona; namespace import quebra a chamada.                                                                                             |

---

## 5. Premissas em aberto

> Adições às já registradas nas Sessões 01-04. Validar com Augusto antes da Fase 4.

1. **PREMISSA**: Cron de 5min está OK para a clínica não ter NO_SHOW pendurado por muito tempo, mas a janela ainda existe — paciente pode chegar, fazer check-in via iDFace, e o cron pode tê-lo marcado como NO_SHOW segundos antes. A Fase 4 (iDFace) precisa decidir o que fazer com check-in chegando depois de marcar NO_SHOW (provavelmente: aceita o check-in e reverte automaticamente).

2. **PREMISSA**: Multi-instance produção precisa de leader election para o cron — senão N réplicas rodam o sweep em paralelo. Hoje é OK para single-instance.

3. **PREMISSA**: O cron NÃO grava `AuditLog` se a transação falhar parcialmente (não há retry no próprio sweep — se algum update falhar, todos rollback). Aceitável: na próxima rodada (5min depois) tenta de novo.

4. **PREMISSA**: Retry de SERIALIZABLE no `create` sobe carga no banco em momentos de pico (5 tentativas por request). Para uma clínica com volume modesto isso é irrelevante. Se virar problema, vale considerar advisory locks dedicados por `(unitId, serviceId, startsAt)` antes da transação.

5. **PREMISSA**: `CHECKED_IN` é setado **manualmente** pelo admin/recepção nesta sessão. A automação via iDFace (CLAUDE.md §4.6) entra na Fase 4 — quando o webhook chegar, vai reusar a mesma `checkIn()` interna do `AppointmentsService`, só envolvendo lookup do paciente pelo `idfaceUserId`.

6. **PREMISSA**: Atribuição de `professionalId` ao appointment continua não implementada. Pode vir na Fase 5 (prontuário) — profissional se atribui ao iniciar a sessão, ou na criação do appointment como campo opcional do admin.

---

## 6. Próximos passos sugeridos

**Sessão 06 — Fase 4 (iDFace check-in)**:

1. Módulo `integrations/idface` com:
   - `IdfaceWebhookController` para `POST /webhooks/idface/access-event`.
   - Idempotência por `(deviceId, timestamp, userId)` via `IdfaceEvent` model novo + unique constraint.
   - Lookup do `Patient` pelo `idfaceUserId` salvo na primeira visita.
   - Busca de appointments do paciente em janela `[agora - checkInWindowBeforeMin, agora + checkInWindowAfterMin]`.
   - Aceita o mais próximo elegível: chama `appointmentsService.checkIn(id)` (já existente!).
   - Se não houver, grava `IdfaceEvent` com `accessGranted=false`.
   - Reversão automática de NO_SHOW se o check-in chegar tarde: se status='NO_SHOW' AND consumedSession=true → reverter via método interno + AuditLog `APPOINTMENT_AUTO_REVERTED_BY_CHECKIN`.

2. Schema novo: `IdfaceEvent { id, patientId?, deviceId, eventAt, accessGranted, appointmentId?, rawPayload Json @db.JsonB, ... }`. Index único `(deviceId, eventAt, idfaceUserId)`.

3. Configuração do webhook: documentar como o equipamento iDFace vai chamar a API (provavelmente via API key num header em vez de JWT). Endpoint marcado `@Public()` mas validado por shared secret.

4. Tests:
   - Unit test do "match de appointment elegível" puro.
   - Integration test do webhook idempotente (mesmo payload 2x → 1 row).

5. Smoke test simulando o equipamento.

**Fase 5 (Prontuário) e Fase 6 (Pagar.me) ficam para depois — Fase 4 desbloqueia o produto real.**
