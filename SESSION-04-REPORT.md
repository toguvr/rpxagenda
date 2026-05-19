# Sessão 04 — Fase 3 parcial (núcleo de agendamento — §4.3 do CLAUDE.md)

Data: 2026-05-19
Branch: `main`
Escopo: o coração do sistema — criação, listagem e cancelamento de `Appointment` com validação atômica dos 6 limites do CLAUDE.md §4.3. No-show automático (cron job) fica para a próxima sessão.

---

## 1. Entregue

### 1.1 Schema (migration `20260519163441_phase3_appointments`)

- **`Appointment`** — janela `[startsAt, endsAt)`, status enum (`SCHEDULED | CONFIRMED | CHECKED_IN | COMPLETED | CANCELLED | NO_SHOW`), `consumedSession` flag, campos de cancelamento (`cancelledAt/cancelledById/cancellationReason`) e de reversão (`revertedAt/revertedById`). Índices compostos pensados para os 6 checks: `(unitId, serviceId, startsAt, status)`, `(unitId, patientId, startsAt)`, `(unitId, startsAt, status)`, `(planId)`.
- **`AppointmentEquipment`** — tabela de junção; `equipmentId` é separado dos "sugeridos" do serviço.
- Enum `AppointmentStatus` registrado.
- `Appointment` adicionado a `UNIT_SCOPED_MODELS` → escopo automático.

### 1.2 Endpoints (8 novos)

| Método | Path                                   | Quem                     | O que faz                                                          |
| ------ | -------------------------------------- | ------------------------ | ------------------------------------------------------------------ |
| `POST` | `/appointments`                        | ADMIN, PROF, **PATIENT** | Cria com validação transacional §4.3                               |
| `GET`  | `/appointments`                        | ADMIN, PROF              | Lista com filtros (patientId, serviceId, fromDate, toDate, status) |
| `GET`  | `/me/appointments`                     | PATIENT                  | Lista do paciente autenticado                                      |
| `GET`  | `/appointments/:id`                    | todos                    | Detalhe (PATIENT validado por ownership)                           |
| `POST` | `/appointments/:id/cancel`             | ADMIN, PROF, PATIENT     | Cancela; lê janela vs `cancellationLeadMinutes`                    |
| `POST` | `/appointments/:id/revert-consumption` | ADMIN                    | Reverte CANCELLED-fora ou NO_SHOW, devolvendo saldo                |

### 1.3 Validação transacional do §4.3 (núcleo do sistema)

Toda a criação acontece em `prisma.$transaction(..., { isolationLevel: 'Serializable' })`.

Dentro da transação:

1. **Coleta snapshot** com 4 queries paralelas:
   - `serviceSlotUsage` — quantos appointments ativos no slot exato deste serviço.
   - `equipmentUsage` — para cada `equipmentId` solicitado, quantos appointments ativos que sobrepõem `[startsAt, endsAt)` já consomem ele.
   - `patientOverlapping` — quantos appointments do paciente sobrepõem o intervalo.
   - `weeklyUsageForPlan` — para SUBSCRIPTION, quantos appointments do plano contam para a quota semanal corrente.

2. **Chama `validateAppointment()`** (função pura em `capacity-validators.ts`) que aplica os 6 checks na ordem:
   - `INVALID_INTERVAL` — startsAt < endsAt e endsAt = startsAt + service.durationMinutes
   - `SERVICE_INACTIVE`
   - `LEAD_TIME_VIOLATION` — startsAt ≥ now + `schedulingLeadMinutes`
   - `PLAN_MISMATCH` — plano casa com (paciente, serviço, type vs acceptedPlanType)
   - `PLAN_NOT_USABLE` — status, datas, saldo PACKAGE, validade PACKAGE, quota SUBSCRIPTION
   - `PATIENT_CONFLICT` — sem sobreposição com outros agendamentos do paciente
   - `SLOT_FULL` — `serviceSlotUsage + 1 ≤ service.slotCapacity`
   - `EQUIPMENT_UNAVAILABLE` — para cada equipamento, `usage + 1 ≤ totalQuantity`

3. **Insere `Appointment` + `AppointmentEquipment[]`** e decrementa `Plan.remainingSessions` se PACKAGE — tudo na mesma transação.

4. **Serialization failure (P2034)** vira `409 RESOURCE_CONFLICT` com sugestão de retry.

### 1.4 Cancelamento (regra §4.5)

- **Dentro de `cancellationLeadMinutes`**: `consumedSession = false`, increment de `remainingSessions` no PACKAGE, AuditLog `APPOINTMENT_CANCELLED_IN_WINDOW`.
- **Fora**: `consumedSession = true` (saldo segue deduzido), AuditLog `APPOINTMENT_CANCELLED_OUT_OF_WINDOW`.
- **Idempotência**: cancelar já-cancelado é no-op.
- **Bloqueios**: `COMPLETED`/`NO_SHOW` rejeitados — admin precisa usar `revert-consumption`.

### 1.5 Reversão admin

- `POST /appointments/:id/revert-consumption` (ADMIN apenas).
- Só age sobre status `CANCELLED` ou `NO_SHOW` com `consumedSession = true`.
- Marca `consumedSession = false`, devolve saldo no PACKAGE, AuditLog `APPOINTMENT_CONSUMPTION_REVERTED`.

### 1.6 Wire real de `countWeeklyUsage` no PlansService

Removido o placeholder retornando 0 — agora conta `Appointment.consumedSession = true` AND `status ∈ {SCHEDULED, CONFIRMED, CHECKED_IN, COMPLETED, NO_SHOW}` AND `startsAt >= startOfWeekMonday(now, unitTimezone)`. `GET /me/plans` e `GET /patients/:id/plans` mostram `weeklyUsage` realista.

### 1.7 Testes — 78 passing (7 suites, +18 vs Sessão 03)

| Suite                         | Novos | Total | Cobertura                                                                                                                                                            |
| ----------------------------- | ----- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capacity-validators.spec.ts` | 18    | 18    | Cada falha individual + caso feliz; checks de intervalo, lead time, plan match, plan usable (PACKAGE saldo/validade, SUBSCRIPTION quota), slot full, equipment usage |

---

## 2. Smoke test end-to-end

Sequência rodada com sucesso (admin + Carla paciente):

| #   | Ação                                                                 | Resultado                                                                 |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | Cria appointment Fisio 26/05 08h                                     | 201, status `SCHEDULED`, `consumedSession=true`                           |
| 2   | `GET /plans/:id` PACKAGE                                             | `remainingSessions = 19` (decrementou de 20)                              |
| 3   | Repete criação no mesmo slot                                         | 409 **PATIENT_CONFLICT**                                                  |
| 4   | Cria com `startsAt = now + 5min` (lead=60)                           | 409 **LEAD_TIME_VIOLATION**                                               |
| 5-6 | 2 SUBSCRIPTION na semana                                             | 201 cada                                                                  |
| 7   | 3ª SUBSCRIPTION (quota=2)                                            | 409 **PLAN_NOT_USABLE** "Quota semanal de 2 agendamentos já foi atingida" |
| 8   | `/me/plans` SUBSCRIPTION                                             | `weeklyQuota=2, weeklyUsage=2`                                            |
| 9   | Cancel Fisio (26/05, hoje 19/05 → fora da janela de 4h? sim, dentro) | `status=CANCELLED, consumedSession=false`                                 |
| 10  | `GET /plans/:id` PACKAGE                                             | `remainingSessions = 20` (devolveu)                                       |
| 11  | `audit_logs` row gravado                                             | `APPOINTMENT_CANCELLED_IN_WINDOW SCHEDULED → CANCELLED`                   |

---

## 3. Decisões técnicas

| Decisão                                   | Escolha                                                                                                         | Por quê                                                                                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Isolamento da transação de create         | `Serializable`                                                                                                  | Mais simples que advisory locks; Postgres serializa as duas leituras+insert atomicamente. Volume da clínica não justifica overhead extra de locks manuais. |
| Serialization failure                     | 409 com sugestão de retry no client                                                                             | Honesto e claro; resilience real fica para retry policy no frontend admin/mobile.                                                                          |
| Decremento de saldo PACKAGE               | No `create`, dentro da mesma transação                                                                          | Evita overbooking entre criação e check-in. Cancel-within devolve.                                                                                         |
| Status que CANCELLED-fora deveria assumir | Mantive `CANCELLED` com `consumedSession=true`                                                                  | Status conceitualmente continua sendo "cancelado"; a flag decide quem contou. Evita ter um `CANCELLED_LATE` enum extra.                                    |
| Patient ownership                         | Controller checa `patient.userId === user.id` para PATIENT                                                      | Defense in depth — paciente nunca vê / cancela agendamento de outro.                                                                                       |
| Lead time vs slot grade                   | Lead time é validado contra `now`, slot grade contra `service.durationMinutes`                                  | Validações independentes; o filtro de `GET /schedules/slots` por lead time é só para conveniência do cliente.                                              |
| Equipment ownership                       | Pre-fetch dos equipamentos no scoped client + validateAppointment confere se cada `equipmentId` aparece no mapa | Bloqueia equipamento de outra unidade (já filtrado pela extensão) E inexistente (filtro adicional explícito).                                              |
| Conflito do paciente                      | Sobreposição `existing.startsAt < new.endsAt AND existing.endsAt > new.startsAt`                                | Algoritmo padrão de interval overlap; serve para qualquer combinação de serviços.                                                                          |
| `@UsePipes` global                        | Trocado por `@Body(new ZodValidationPipe(schema))` inline                                                       | `@UsePipes` ao nível do método rodava o pipe no `@CurrentUser()` também e falhava — bug encontrado durante o smoke test.                                   |

---

## 4. Não implementado nesta sessão (entra na próxima)

1. **Job de detecção de no-show** (CLAUDE.md §4.5): `Appointment.status = CONFIRMED && checkedInAt = null && now > endsAt + graceMinutes` → `NO_SHOW`. Vai usar `@nestjs/schedule` com cron a cada 5min. **Dependência mínima**: instalar `@nestjs/schedule` e fazer um cron simples consultando appointments em janela apertada.

2. **Auto-fill de equipamentos via protocol** (CLAUDE.md §4.4): hoje o `equipmentIds` é explícito no payload. Quando o módulo `protocols` existir (Fase 5), o create pré-popula a partir do protocolo ativo do paciente e o caller só remove se quiser.

3. **Limite global do horário** (CLAUDE.md §4.3 item 2): não há campo `Unit.globalCapacityPerSlot` no schema. Quando a clínica pedir, é uma migration + um check adicional em `validateAppointment`.

4. **Endpoint `confirm`/`check-in`/`complete`**: transições de status (SCHEDULED → CONFIRMED → CHECKED_IN → COMPLETED) ficam para a próxima sessão junto com o check-in via iDFace (Fase 4).

5. **Atribuição de profissional**: `Appointment.professionalId` é opcional e ninguém preenche ainda. Vai junto com o admin web (Fase 1 do roadmap, ainda não iniciada).

6. **Integration tests** com Supertest (concorrência real, race conditions sob SERIALIZABLE): nesta sessão temos unit tests dos validators puros. Testes de transação real ficam para uma sessão dedicada.

---

## 5. Premissas em aberto

> Mantém as da Sessão 03 ainda válidas (timezones, quota on-the-fly etc) e adiciona:

1. **PREMISSA**: SERIALIZABLE simples sem retry. Em produção, talvez valha um middleware de retry para `P2034` (1-2 tentativas com backoff curto). Por ora, client retry é suficiente para uma clínica.

2. **PREMISSA**: `Appointment.startsAt` precisa bater exatamente com a grade gerada (`generateSlots`). Não há validação no servidor de "o startsAt está num slot válido" — o cliente sempre vai escolher um do `/schedules/slots`. Se vier um startsAt malicioso fora da grade, o serviço ainda aceita (desde que os 6 checks passem). Considerar adicionar `isOnGrid(startsAt, service, unit)` se virar problema.

3. **PREMISSA**: `consumedSession` na criação é `true` por default (saldo já foi deduzido). O cancel é quem alterna. Não há automação "consumedSession ← false quando COMPLETED não acontece dentro do dia" — isso é o job de no-show.

4. **PREMISSA**: O `revert-consumption` só ajusta saldo do PACKAGE. Para SUBSCRIPTION não há saldo a devolver — a quota semanal volta naturalmente para o cálculo do próximo `countWeeklyUsage` quando o appointment some da contagem (já que `consumedSession=false` exclui da soma).

---

## 6. Estado atual do sistema

- **Migrations**: 5 (init, phase1, phase2_schedule_and_plans, phase2_business_hours_per_service, phase3_appointments).
- **Modelos Prisma**: 13 → **15** (+ Appointment, AppointmentEquipment).
- **Endpoints**: 31 → **39** (+8).
- **Testes**: 60 → **78** (+18 do validator puro).
- **Módulos NestJS**: 8 → **9** (+appointments).
- **Commits da sessão**: 2 (schema, appointments completo).

---

## 7. Próximos passos sugeridos

**Próxima sessão (Fase 3 final + Fase 4 início):**

1. `@nestjs/schedule` + cron de no-show (5min de intervalo). AuditLog em cada NO_SHOW automaticamente marcado.
2. Endpoints de transição: `POST /appointments/:id/confirm` (paciente confirma presença), `POST /appointments/:id/check-in` (admin/iDFace), `POST /appointments/:id/complete` (profissional finaliza).
3. **Integration tests** com Supertest: race condition real (dois POSTs paralelos no mesmo slot — só 1 deve vencer).
4. Iniciar Fase 4 (iDFace check-in): módulo `integrations/idface` com interface + implementação webhook.

**Fase 5 (Prontuário) e Fase 6 (Pagar.me) ficam para depois.**
