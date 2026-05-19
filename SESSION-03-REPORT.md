# Sessão 03 — Fase 2 (Grade e Planos)

Data: 2026-05-18
Branch: `main`
Escopo: [Fase 2 do roadmap](CLAUDE.md#10-roadmap-de-implementação-alto-nível) — horário de funcionamento, exceções, geração dinâmica de slots, planos PACKAGE/SUBSCRIPTION (sem Pagar.me ainda).

---

## 1. Entregue

### 1.1 Schema (migration `20260519024607_phase2_schedule_and_plans`)

- **`BusinessHours`** — janelas de funcionamento por `weekday` (0=dom..6=sáb) + `opensAt`/`closesAt` em HH:MM no fuso da unidade. Múltiplas janelas no mesmo dia (manhã + tarde) permitidas.
- **`ScheduleException`** — exceção pontual por `date` (única por `(unitId, date)`); tipo `CLOSED` (feriado) ou `CUSTOM` (horário diferente, exige opensAt/closesAt).
- **`Plan`** — contrato comercial paciente↔serviço. Campos PACKAGE (`totalSessions`/`remainingSessions`/`validUntil`) e SUBSCRIPTION (`weeklyQuota`/`pagarmeSubscriptionId`/`nextBillingAt`) coexistem; `type` discrimina. Status enum: `PENDING_PAYMENT | ACTIVE | PAST_DUE | SUSPENDED | EXPIRED | CANCELLED`.

Todos os três modelos novos têm `unitId` e foram registrados em `UNIT_SCOPED_MODELS` — escopo automático via Prisma `$extends`.

### 1.2 Endpoints (11 novos)

**Schedules** (`/schedules`)

- `POST/GET/DELETE /schedules/business-hours` (ADMIN cria/remove, PROF lê).
- `POST/GET/DELETE /schedules/exceptions` (ADMIN cria/remove, PROF lê).
- `GET /schedules/slots?serviceId=&date=YYYY-MM-DD` (ADMIN/PROF/PATIENT) — geração dinâmica.

**Plans** (`/plans`, `/patients/:patientId/plans`, `/me/plans`)

- `POST /plans` (ADMIN) — payload discriminado por `type`.
- `GET /patients/:patientId/plans` (ADMIN/PROF).
- `GET /me/plans` (PATIENT) — usa CLS para descobrir o paciente do user autenticado.
- `GET /plans/:id` (todos).
- `PATCH /plans/:id/status` (ADMIN) — registra `AuditLog`, bloqueia reativação de status final.

### 1.3 Lógica de domínio

**Slot generator** ([`slot-generator.ts`](apps/api/src/modules/schedules/slot-generator.ts), pura e testada):

- Combina `date + windows` no timezone da unidade; gera slots de duração fixa do serviço.
- O último slot **termina** dentro da janela (nunca ultrapassa `closesAt`).
- Filtra slots cujo início é anterior a `now + schedulingLeadMinutes`.
- Várias janelas no mesmo dia (manhã + tarde) suportadas natively.
- `startOfWeekMonday(date, tz)` calcula o início da semana corrente para reset de quota de SUBSCRIPTION (segunda 00:00 no fuso da unidade).

**Plan helpers** ([`plan-helpers.ts`](apps/api/src/modules/plans/plan-helpers.ts), puro e testado):

- `isPlanUsable(plan, now)` — bloqueia se status ≠ ACTIVE, ou saldo zero, ou validade vencida, ou janela startsAt/endsAt fora do agora.
- `deriveExpectedStatus(plan, now)` — PACKAGE com saldo zero ou validade vencida → EXPIRED; status terminais (CANCELLED/SUSPENDED/PENDING_PAYMENT) não mudam.
- `buildQuotaStatus(plan, usage)` — devolve `{ weeklyQuota, weeklyUsage, weeklyRemaining }`.

**PlansService.countWeeklyUsage** — placeholder retornando 0. **Será wired** com `Appointment` na Fase 3; assinatura estável para evitar refator depois.

**PlansService.assertUsable** — exposto publicamente para a Fase 3 chamar antes de criar appointment.

### 1.4 Decisões técnicas (registradas como PREMISSA quando aplicável)

| Decisão                          | Escolha                                          | Por quê                                                                                                                                |
| -------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Datas no banco                   | UTC                                              | Padrão Prisma; conversão para `Unit.timezone` apenas na fronteira (slot generator, semana).                                            |
| Slot generation                  | On-the-fly (função pura)                         | Sem materialização. Trivial de testar; performance OK para os volumes esperados.                                                       |
| Reset semanal de quota           | On-the-fly                                       | Sem cron. `countWeeklyUsage()` recalcula a cada read. Mais simples; barato dado o volume.                                              |
| BusinessHours.opensAt / closesAt | String HH:MM                                     | Não precisa de timezone embutido — `BusinessHours` é "local da unidade" por definição. Combinação com data acontece no slot generator. |
| ScheduleException.date           | `@db.Date`                                       | Sem hora. Match exato YYYY-MM-DD por unidade.                                                                                          |
| Plan sem Pagar.me                | Criado já como `ACTIVE`                          | Fase 2 não tem integração de cobrança. `PENDING_PAYMENT` existe no enum mas só será produzido pela Fase 6.                             |
| Dedução de `remainingSessions`   | **Não implementada** ainda                       | Vai junto com a criação de Appointment + transição para `COMPLETED` / `NO_SHOW` na Fase 3.                                             |
| Reativação de plano              | Bloqueada se status atual ∈ {CANCELLED, EXPIRED} | Force criação de novo plano para evitar bagunça de histórico.                                                                          |
| AuditLog                         | Gravado em mudança de status de plano            | Cumpre §2.3 do CLAUDE.md (operação sensível).                                                                                          |

### 1.5 Testes — 60 passing (6 suites, +24 vs Sessão 02)

| Suite                    | Novos | Total | Cobertura                                                                                    |
| ------------------------ | ----- | ----- | -------------------------------------------------------------------------------------------- |
| `slot-generator.spec.ts` | 10    | 10    | janela única, múltiplas janelas, lead time, janelas inválidas, fuso BRT, `startOfWeekMonday` |
| `plan-helpers.spec.ts`   | 14    | 14    | `isPlanUsable` (todos os caminhos), `deriveExpectedStatus`, `buildQuotaStatus`               |
| (existentes)             | —     | 36    | auth, applyUnitScope, cpf, invite                                                            |

---

## 2. Smoke tests end-to-end (manuais)

API rodando em `localhost:3333`, admin do seed autenticado:

```bash
# BusinessHours
POST 5x /schedules/business-hours seg-sex 08:00-12:00 → 201
POST 3x /schedules/business-hours seg/qua/sex 14:00-18:00 → 201

# ScheduleException
POST /schedules/exceptions {date:'2026-12-25', type:'CLOSED', reason:'Natal'} → 201

# Slots
GET /schedules/slots?serviceId=FISIO&date=2026-05-26 → 4 slots (terça só manhã)
GET /schedules/slots?serviceId=FISIO&date=2026-05-27 → 8 slots (quarta manhã+tarde)
GET /schedules/slots?serviceId=FISIO&date=2026-12-25 → 0 slots (CLOSED)
GET /schedules/slots?serviceId=FISIO&date=2026-05-23 → 0 slots (sábado sem hours)

# Plans
POST /plans PACKAGE 20 sessões Fisio → 201, remainingSessions=20
POST /plans SUBSCRIPTION 3x/semana Musculação → 201, weeklyQuota=3
POST /plans PACKAGE Musculação → 409 (serviço aceita SUBSCRIPTION)

# Endpoints do paciente
GET /me/plans (Carla, PATIENT) → 2 planos, weeklyUsage=0 (placeholder até Fase 3)

# Transições + audit
PATCH /plans/{id}/status SUSPENDED → 200
PATCH /plans/{id}/status ACTIVE → 200 (reativação a partir de SUSPENDED OK)
PATCH /plans/{id}/status CANCELLED → 200
PATCH /plans/{id}/status ACTIVE → 409 (não pode reativar de CANCELLED)

# AuditLog (verificado direto no Postgres)
3 rows PLAN_STATUS_CHANGED com before/after corretos
```

---

## 3. Bugs encontrados e corrigidos durante a sessão

1. **Date parsing em `/schedules/slots?date=YYYY-MM-DD`** — `new Date('2026-05-26')` no Node parseia como UTC midnight, que em BRT é 21h do dia anterior. Causava deslize de calendário: requisição para terça retornava slots de segunda. **Fix**: o controller passa a string crua; o service interpreta a data em "meio-dia local" no fuso da unidade via `date-fns-tz`, garantindo o dia correto.
2. **`consistent-type-imports` autofix** convertendo class imports em type-only quebraria DI (já tinha sido resolvido na Sessão 02). Reincidência prevenida pela regra desligada globalmente.

---

## 4. Premissas em aberto (validar com Augusto)

> Adicionadas às premissas vigentes da Sessão 02 ([SESSION-02-REPORT §5](SESSION-02-REPORT.md#5-premissas-em-aberto-para-sessões-futuras)).

1. **PREMISSA**: `BusinessHours` representa horário **da unidade**, válido para qualquer serviço. Não há grade específica por serviço ou por profissional. Se a clínica precisar de horários diferentes por modalidade (ex: musculação só à tarde), vamos precisar de uma tabela `ServiceBusinessHours` extra. Por ora, conflitos resolvem-se em UI (admin marca slots inválidos como exceção).
2. **PREMISSA**: Slot generator não considera **profissional disponível**. O CLAUDE.md §3 diz "qualquer profissional habilitado pode atender qualquer paciente do serviço" — então a grade temporal não depende de profissional. Atribuição de profissional ao agendamento vem no momento do check-in/atendimento (Fase 3+).
3. **PREMISSA**: `acceptedPlanType` continua singular por serviço (decidimos manter na Sessão 02; revisitar quando a clínica precisar de Avaliação avulsa).
4. **PREMISSA**: Reset semanal de quota é **on-the-fly** via `countWeeklyUsage`. Se o volume crescer e isso virar gargalo, podemos materializar em um agregado por semana, mas para o MVP é desnecessário.
5. **PREMISSA**: `Plan.startsAt` defaulta para `now` na criação. Se a clínica vender pacote com início futuro (ex: paciente compra hoje, começa próxima segunda), o admin já pode passar `startsAt` no payload — Zod aceita o campo opcional.
6. **PREMISSA**: O endpoint `PATCH /plans/:id/status` exige reason apenas opcional. Para audit forte (LGPD/contratos), pode virar obrigatório em casos de SUSPENDED/CANCELLED. Avaliar quando o admin web estiver sendo construído.

---

## 5. Estado atual do sistema

- **Migrations**: 3 (`init`, `phase1_catalog_and_people`, `phase2_schedule_and_plans`).
- **Modelos Prisma**: 13 (Unit, User, RefreshToken, AuditLog, Service, Equipment, ServiceEquipment, Professional, ProfessionalService, Patient, PatientInvite, BusinessHours, ScheduleException, Plan).
- **Endpoints**: 20 → **31** (+11).
- **Testes**: 36 → **60** (+24).
- **Módulos NestJS**: 6 → **8** (+schedules, +plans).
- **Commits da sessão**: 4 (schema, schedules, plans, report).

---

## 6. Próximos passos sugeridos — Fase 3 (núcleo de agendamento)

A Fase 3 do roadmap é o **coração do sistema** (regra de capacidade §4.3). Sugestão de slices:

1. **Schema `Appointment`** + enum `AppointmentStatus` (`SCHEDULED|CONFIRMED|CHECKED_IN|COMPLETED|CANCELLED|NO_SHOW`), tabela `AppointmentEquipment`.
2. **Validação transacional** dos 6 limites do §4.3, com **Postgres advisory lock** por `(unitId, serviceId, startsAt)`:
   - Capacidade do serviço por slot
   - Equipamentos disponíveis no horário
   - Plano com saldo/quota (chamando `PlansService.assertUsable` + `countWeeklyUsage`)
   - Antecedência mínima
   - Sem conflito do paciente no mesmo horário
   - (Limite global opcional, pular se não configurado)
3. **Wire de `PlansService.countWeeklyUsage`** com a query real de `Appointment`.
4. **Cancelamento + no-show**:
   - Dentro do prazo → devolve sessão ao plano (em transação).
   - Fora do prazo → desconta normalmente; admin pode reverter via endpoint + AuditLog.
5. **Job de detecção de no-show**: agendamento `CONFIRMED` sem `checkedInAt` até `endsAt + graceMinutes` vira `NO_SHOW`. Implementar com `@nestjs/schedule` (cron 5min) ou similar.
6. **Tests unitários massivos** da validação de capacidade (race conditions, equipamento esgotado, etc) + e2e com Supertest para o happy path.

Bloqueios técnicos antecipados:

- Locks transacionais no Prisma: usar `$queryRaw` com `pg_advisory_xact_lock` ou setar `isolationLevel: 'Serializable'`. Decidir cedo.
- Decidir se cancellation/no-show **revertível** dispara AuditLog automaticamente (provavelmente sim).
