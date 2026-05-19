# Sessão 02 — Pendências da Sessão 01 + Fase 1 (Catálogo e cadastros)

Data: 2026-05-18
Branch: `main`
Escopo: fechar os pontos em aberto do [SESSION-01-REPORT](SESSION-01-REPORT.md) (cuid v1, seed hardening, unit-scope automático) e entregar a [Fase 1 do roadmap](CLAUDE.md#10-roadmap-de-implementação-alto-nível) — backend dos cadastros centrais (serviços, equipamentos, profissionais, pacientes) + fluxo de convite do paciente.

---

## 1. Pendências da Sessão 01 — fechadas

| #   | Item                                               | Como ficou                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Conflito cuid v1 vs cuid2                          | `CLAUDE.md §7.1` reescrito fixando **cuid v1** (`@default(cuid())`) como padrão de IDs.                                                                                                                                                                                                                                                                                                                               |
| 2   | `SEED_ADMIN_PASSWORD` default em qualquer ambiente | `prisma/seed.ts` agora **recusa rodar com defaults** quando `NODE_ENV !== 'development'`. Mensagem clara orienta a definir as variáveis explicitamente. Em dev o comportamento é idêntico.                                                                                                                                                                                                                            |
| 3   | Unit-scope automático                              | Infra completa: `nestjs-cls` global; `UnitScopeInterceptor` propaga `unitId` no CLS; **`buildUnitScopeExtension`** intercepta toda query Prisma e injeta `where.unitId` para modelos registrados em `UNIT_SCOPED_MODELS`; valida `data.unitId` em creates para impedir gravação cross-tenant; opt-out via `runWithoutUnitScope(cls, fn)`. Núcleo é uma **função pura** `applyUnitScope()` com **9 testes unitários**. |

---

## 2. Fase 1 — entregue

### 2.1 Schema (migration `20260519021841_phase1_catalog_and_people`)

Adicionados ao Prisma:

- **`Service`** — name único por unidade, `durationMinutes`, `slotCapacity`, leads de cancelamento/agendamento, janela de check-in, `acceptedPlanType`, `active`.
- **`Equipment`** — name único por unidade, `totalQuantity`, `active`.
- **`ServiceEquipment`** — N:N (equipamentos sugeridos por serviço).
- **`Professional`** — 1:1 com `User` (role=PROFESSIONAL), `registry` único por unidade, `active`.
- **`ProfessionalService`** — N:N (serviços que o profissional atende).
- **`Patient`** — `cpf` único por unidade, `userId` opcional (preenchido na redenção), `idfaceUserId` opcional (preenchido no cadastro biométrico futuro), `email`/`phone`/`emergencyContact`/`notes`.
- **`PatientInvite`** — token armazenado como HMAC-SHA256, `expiresAt`, `redeemedAt`.

Enums: `ServiceType` (FISIO/MUSCULACAO/RPG/PILATES/AVALIACAO), `PlanType` (PACKAGE/SUBSCRIPTION).

Todos os modelos com `unitId` foram registrados em `UNIT_SCOPED_MODELS` → todas as queries que passam por `prisma.scoped` filtram automaticamente por unidade.

### 2.2 Endpoints (15 novos)

**Services** (`/services`)

- `POST` (ADMIN), `GET` (ADMIN/PROF), `GET /:id` (ADMIN/PROF), `PATCH /:id` (ADMIN), `DELETE /:id` (ADMIN)
- `GET /:serviceId/equipments` (ADMIN/PROF), `PUT /:serviceId/equipments` (ADMIN) — substitui o set de equipamentos sugeridos atomicamente

**Equipments** (`/equipments`)

- `POST` (ADMIN), `GET` (ADMIN/PROF), `GET /:id`, `PATCH /:id` (ADMIN), `DELETE /:id` (ADMIN)

**Professionals** (`/professionals`)

- `POST` (ADMIN): cria User PROFESSIONAL + Professional + vínculos com services em uma transação
- `GET`, `GET /:id`, `PATCH /:id`, `DELETE /:id` (ADMIN)
- `PATCH active=false` revoga todos os refresh tokens do User; `DELETE` apaga via cascade do User

**Patients** (`/patients` e `/patient-invites`)

- `POST /patients` (ADMIN/PROF), `GET`, `GET /:id`, `PATCH /:id` (ADMIN/PROF), `DELETE /:id` (ADMIN)
- `POST /patients/:id/invites` (ADMIN): gera token 32 bytes base64url, TTL 7 dias, **persiste só o hash**, retorna o plain uma única vez + `redeemPath`
- `GET /patient-invites/:token` (público): lookup com dados básicos do paciente
- `POST /patient-invites/:token/redeem` (público): paciente define senha → sistema cria User PATIENT, vincula ao Patient, marca convite redeemido, **devolve par access/refresh pronto** (delega para `AuthService.issueLoginTokens`)

Convite traz mapeamento de erro: convite inexistente/expirado/redeemido → **410 Gone**; paciente sem email → 409; paciente já com conta → 409.

### 2.3 Validações de domínio

- **CPF**: validador oficial em `@rpx/shared/cpf.ts` (algoritmo dos dois dígitos verificadores + rejeita sequências repetidas). Aplicado via Zod `.refine()`. Normalizado para só dígitos no banco.
- **Email único**: garantido pelo unique do User no banco; mapeado para 409 com mensagem.
- **CPF único por unidade, registry único por unidade, name único por unidade** (Service e Equipment) — todos mapeados para 409 com mensagem amigável.
- **FK violation no DELETE** → 409 sugerindo desativar em vez de excluir.
- **Cross-tenant write attempts** bloqueados pela extensão Prisma (`applyUnitScope` lança erro com message diagnóstica).

### 2.4 Testes — 36 passing (4 suites)

| Suite                          | Testes | Cobertura                                           |
| ------------------------------ | ------ | --------------------------------------------------- |
| `auth.service.spec.ts`         | 7      | login, refresh rotation, reuso, logout              |
| `unit-scope.extension.spec.ts` | 9      | extensão Prisma de unit-scope (núcleo puro)         |
| `cpf.spec.ts`                  | 11     | validador CPF com casos canônicos válidos/inválidos |
| `patients.invite.spec.ts`      | 9      | ciclo completo do convite com fake Prisma in-memory |

---

## 3. Smoke tests end-to-end (manuais nesta sessão)

Todos rodados com a API em `localhost:3333`, autenticado como admin do seed:

```bash
# Services
POST /services Fisioterapia → 201
POST /services Musculação → 201
POST /services Fisioterapia (duplicate) → 409 RESOURCE_CONFLICT

# Equipments
POST /equipments Maca → 201
POST /equipments "Bola Suíça" → 201
PUT /services/{id}/equipments [maca, bola] → 204
GET /services/{id}/equipments → [maca, bola]

# Professionals
POST /professionals (Ana, CREFITO 12345-F) → 201
POST /auth/login (ana@) → 200 com role=PROFESSIONAL
POST /professionals (mesmo registry) → 409

# Patients + invite flow
POST /patients Carla CPF=111.444.777-35 → 201 (CPF normalizado para 11144477735)
POST /patients com CPF inválido → 400 VALIDATION_ERROR
POST /patients/{id}/invites → 201 com {token, expiresAt, redeemPath}
GET /patient-invites/{token} → 200 com nome+email+cpf
POST /patient-invites/{token}/redeem {password} → 200 com tokens + user role=PATIENT
POST /auth/login (carla@) → 200 com role=PATIENT
POST /patient-invites/{token}/redeem (mesmo token) → 410 INVITE_INVALID
POST /patients/{id}/invites (já tem User) → 409
```

---

## 4. Decisões técnicas adicionais

| Decisão                               | Escolha                                    | Por quê                                                                                                                                       |
| ------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Auto-scoping de tenant                | Prisma `$extends` + `nestjs-cls`           | Sem AsyncLocalStorage explícita nos services; cada query escopa sozinha. `runWithoutUnitScope` é o opt-out.                                   |
| Tipagem do cliente estendido          | `ScopedPrismaClient = PrismaClient` (cast) | `ReturnType<PrismaClient['$extends']>` perde os accessors de modelo em TS. Cast preserva a DX sem mudar runtime.                              |
| Criação do User do profissional       | Admin define email/senha diretamente       | Profissional é staff interno; invite flow fica reservado para pacientes (espelha o spec).                                                     |
| Cascade do DELETE de profissional     | Apaga o User (cascade remove Professional) | Simples e atômico. Se houver FK futura (medical records, appointments), o Prisma retorna P2003 e mapeamos para 409 com sugestão de desativar. |
| Reuso de invite token                 | Detectado por `redeemedAt != null` → 410   | Patient invite é use-once. Diferente do refresh token (rotacionado), aqui não há "família" a revogar.                                         |
| Hash do invite                        | HMAC-SHA256 com `JWT_REFRESH_SECRET`       | Reutiliza o mesmo segredo dedicado já validado em prod. Equivalente ao hash do refresh token.                                                 |
| ESLint rule `consistent-type-imports` | Desativada globalmente                     | O autofix convertia imports de classes injetadas em `import type`, zerando a metadata de decorator do NestJS e quebrando DI em runtime.       |

---

## 5. Premissas em aberto (para sessões futuras)

> Marcadas como `// PREMISSA: ...` quando aplicável, e aqui para tracking.

1. **PREMISSA: validar com Augusto** — `Service.acceptedPlanType` é singular hoje; se algum serviço aceitar tanto PACKAGE quanto SUBSCRIPTION (ex: Avaliação avulsa OU dentro de pacote), vamos precisar mudar para `acceptedPlanTypes` (array) ou flag separada. Por ora segui o spec literal.
2. **PREMISSA: validar com Augusto** — Profissional é criado com senha definida pelo admin. Alternativa: também enviar invite (mesmo flow do paciente). Posso retrofittar facilmente; questão de UX para o admin.
3. **PREMISSA: validar com Augusto** — Patient invite tem TTL fixo de 7 dias (hardcoded). Se precisar configurável por unidade, mover para `Unit.inviteTtlDays` ou env.
4. **PREMISSA: validar com Augusto** — Patient sem email não pode redimir convite (retorna 409). Solução real depende do UX que vamos usar (admin pré-cadastra email obrigatoriamente? ou paciente informa email na redenção?). Segui o caminho mais seguro: bloqueia.
5. **PREMISSA: validar com Augusto** — Generate de novo invite quando paciente já tem User retorna 409. Útil para evitar criar conta duplicada acidentalmente, mas pode atrapalhar o caso "perdi a senha, preciso de novo invite". O caminho correto provavelmente é um fluxo separado de reset de senha (Fase 6 ou 7).
6. **PREMISSA: validar com Augusto** — Audit log ainda não está sendo escrito (`AuditLog` existe no schema mas nenhum service grava). Vou ligar isso a operações sensíveis quando tivermos planos e prontuários (Fase 5+).
7. **PREMISSA: validar com Augusto** — Tests da Fase 1 são unitários com fakes in-memory de Prisma. Testes de integração (Supertest contra DB real, com helpers de fixture) ficam para uma sessão dedicada antes da Fase 3 (agendamentos), onde a complexidade transacional exige cobertura real.

---

## 6. Próximos passos sugeridos — Fase 2 (Grade e planos)

1. **Módulo `schedules`**: `BusinessHours` por dia da semana + `ScheduleException` (feriados, fechamentos) + endpoint que **gera slots dinamicamente** a partir de `(date, serviceId)`.
2. **Módulo `plans`**: schema de `Plan` (PACKAGE com `totalSessions/remainingSessions/validUntil`, SUBSCRIPTION com `weeklyQuota/pagarmeSubscriptionId/nextBillingAt`) + endpoint admin de criar plano sem Pagar.me ainda (status PENDING_PAYMENT → ACTIVE manual). Reset semanal de quota em segunda-feira 00:00 BRT.
3. **Tipos compartilhados** dos planos em `@rpx/shared`.
4. **Tests**: unit tests da geração de slots considerando duração, exceções e horário de funcionamento; tests do reset semanal de quota.

Bloqueios técnicos a antecipar:

- Decidir formato de armazenamento de horário (timezone fixo da unidade vs UTC).
- Estratégia para job de reset de quota: cron interno (`@nestjs/schedule`) ou consulta on-the-fly?

---

## 7. Stats da sessão

- **Commits**: 17 (cuid fix, seed hardening, unit-scope + tests, schema Fase 1, 4 módulos com smoke tests, 2 suítes de tests).
- **Migrations Prisma**: 1 nova (`phase1_catalog_and_people`).
- **Testes**: 16 → 36 (+20).
- **Endpoints**: 5 → 20 (+15).
- **LOC novos** (aproximado): ~2000.
