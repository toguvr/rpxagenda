# Sessão 06 — Fase 4 (iDFace check-in via webhook)

Data: 2026-05-19
Branch: `main`
Escopo: implementar a [Fase 4 do roadmap](CLAUDE.md#10-roadmap-de-implementação-alto-nível) — receber eventos do equipamento iDFace ControliD, identificar paciente, marcar check-in automaticamente no agendamento elegível, com idempotência forte e reversão de NO_SHOW tardio.

---

## 1. Entregue

### 1.1 Schema (migration `phase4_idface_events`)

- **`IdfaceEvent`** — registro de cada evento do equipamento:
  - `deviceId`, `idfaceUserId`, `eventAt` (do equipamento)
  - `accessGranted` (boolean), `outcome` (enum)
  - `patientId?`, `appointmentId?`, `rawPayload` Json (preserva payload bruto)
  - `unitId` (derivada do paciente; pra `PATIENT_NOT_FOUND` cai em "primeira unidade" para diagnose)
  - **`@@unique([deviceId, eventAt, idfaceUserId])`** garante idempotência por reenvio
- Enum **`IdfaceEventOutcome`**: `CHECKIN_OK | CHECKIN_OK_REVERTED_NO_SHOW | NO_APPOINTMENT_IN_WINDOW | PATIENT_NOT_FOUND | ALREADY_CHECKED_IN`
- Back-refs em `Unit`, `Patient`, `Appointment`.

### 1.2 Endpoint `POST /webhooks/idface/access-event`

- **Público** (sem JWT), autenticado via header **`X-IDFace-Secret`** validado por **`IdfaceWebhookGuard`** com `crypto.timingSafeEqual` (resistente a timing attack).
- Env `IDFACE_WEBHOOK_SECRET` em `env.schema.ts` + `.env.example`.
- Payload mínimo: `{ idfaceUserId, deviceId, timestamp }` (extras preservados em `rawPayload`).
- Resposta:
  ```json
  { "accessGranted": true, "outcome": "CHECKIN_OK", "appointmentId": "...", "message": "..." }
  ```
- Validação Zod do payload via `ZodValidationPipe`.

### 1.3 Lógica de processamento (`IdfaceService.processEvent`)

1. **Idempotência**: lookup `(deviceId, eventAt, idfaceUserId)`. Se já existir → retorna a resposta original sem reagir. ⟶ Catraca trava ou libera consistente em reenvios.
2. **Lookup do paciente**: `Patient.idfaceUserId` é unique global. Se não achar → grava `IdfaceEvent` com `outcome=PATIENT_NOT_FOUND`, `accessGranted=false`.
3. **Set CLS.unitId** do paciente para a extensão Prisma escopar — webhook é cross-tenant antes desse ponto.
4. **Busca candidatos** no `Patient`: appointments em `[SCHEDULED, CONFIRMED, NO_SHOW]` na janela bruta `[now-2h, now+2h]` (pré-filtro barato).
5. **`pickEligibleAppointment(candidates, now)`** (puro, testado): aplica a janela real por serviço `[startsAt - checkInWindowBeforeMin, startsAt + checkInWindowAfterMin]` e escolhe o com `startsAt` mais próximo de `now`. Se nada → outcome `NO_APPOINTMENT_IN_WINDOW`, `accessGranted=false`.
6. **`AppointmentsService.checkInAcceptingLateNoShow(id)`**:
   - `SCHEDULED`/`CONFIRMED` → `CHECKED_IN`, audit `APPOINTMENT_CHECKED_IN`.
   - `NO_SHOW` (cron já marcou) → **reverte**: devolve saldo do PACKAGE (`remainingSessions += 1`), marca `revertedAt`/`revertedById`, status vira `CHECKED_IN`, audit **`APPOINTMENT_AUTO_REVERTED_BY_CHECKIN`**.
   - Idempotente: já `CHECKED_IN` → no-op.
7. Grava `IdfaceEvent` final com outcome correto, `accessGranted=true`, ligado a `patientId` e `appointmentId`.
8. Trata `P2002` no grava do evento (race rara) silenciosamente — outro request paralelo já gravou o mesmo evento.

### 1.4 Testes — 101 passing (11 suites, +15 vs Sessão 05)

| Suite                        | Novos | Cobertura                                                                                                                                                                                |
| ---------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `match-appointment.spec.ts`  | 8     | função pura: janela antes/depois, NO_SHOW elegível, rejeita status terminais, múltiplos candidatos, vazio                                                                                |
| `idface.integration.spec.ts` | 7     | 401 sem header, 401 segredo errado, paciente desconhecido, sem appointment, happy path (CHECKED_IN), idempotência (1 row + respostas iguais), reversão NO_SHOW (saldo devolvido + audit) |

Stats acumuladas: **101 testes** (86 → 101), **11 suites** (9 → 11), 8 migrations.

---

## 2. Smoke fluxo (validado por integration tests)

```
1. Equipamento envia POST /webhooks/idface/access-event sem header  → 401
2. Equipamento envia POST com X-IDFace-Secret errado                → 401
3. POST com idfaceUserId desconhecido                                → 200 { accessGranted:false, outcome:PATIENT_NOT_FOUND }
4. POST com idfaceUserId conhecido mas sem appointment elegível      → 200 { accessGranted:false, outcome:NO_APPOINTMENT_IN_WINDOW }
5. POST no horário (startsAt - 30min ≤ now ≤ startsAt + 15min)       → 200 { accessGranted:true,  outcome:CHECKIN_OK }
                                                                       Appointment.status: SCHEDULED → CHECKED_IN
6. Reenvio do mesmo (deviceId, timestamp, idfaceUserId)              → 200 mesma resposta, NO ROW novo
7. POST após cron ter marcado NO_SHOW (checkInWindowAfterMin grande) → 200 { accessGranted:true, outcome:CHECKIN_OK_REVERTED_NO_SHOW }
                                                                       Appointment.status: NO_SHOW → CHECKED_IN, saldo +1, audit gravado
```

---

## 3. Decisões técnicas

| Decisão                          | Escolha                                                                      | Por quê                                                                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Autenticação do webhook          | Shared secret no header + `timingSafeEqual`                                  | iDFace ControliD não fala JWT. Secret estático com comparação safe. Em prod virar rotação periódica.                                         |
| Idempotência                     | Unique no DB `(deviceId, eventAt, idfaceUserId)` + lookup antes de processar | Equipamento pode reenviar. Garantia em 2 camadas: lookup explícito + constraint do banco.                                                    |
| Unit resolution                  | Patient.idfaceUserId é unique global → patient.unitId vira contexto          | Sem precisar registrar device-→unit. Se houver multi-unit, cada paciente fica numa só.                                                       |
| `PATIENT_NOT_FOUND`              | Grava IdfaceEvent na "primeira Unit"                                         | Não tem como saber a unidade do device. Admin investiga via dashboard. **PREMISSA**: validar.                                                |
| Reversão de NO_SHOW              | `checkInAcceptingLateNoShow` novo método (em vez de reusar `checkIn`)        | Lógica diferente: precisa devolver saldo, marcar `revertedAt`, usar audit action específica.                                                 |
| Após reversão, `consumedSession` | volta para `true`                                                            | Paciente compareceu agora; a sessão vai ser efetivamente realizada.                                                                          |
| Erro `P2002` no save final       | Engole silenciosamente                                                       | Race rara: dois requests paralelos com mesmo payload tentam gravar o mesmo IdfaceEvent. Idempotência cobre — a resposta retornada é correta. |
| Webhook route prefix             | `/webhooks/idface/access-event`                                              | Match com convenção do CLAUDE.md §4.6. Subdomínio `webhooks/<provider>/...` cria espaço para Pagar.me na Fase 6.                             |

---

## 4. Premissas em aberto

> Adições às já registradas nas Sessões 01-05.

1. **PREMISSA**: `IdfaceEvent` de `PATIENT_NOT_FOUND` é gravado contra a primeira Unit do banco. OK em single-tenant; em multi-unit produção precisa registrar device→unit (tabela `IdfaceDevice { deviceId, unitId }`) para roteamento correto.

2. **PREMISSA**: Sem rotação automática do `IDFACE_WEBHOOK_SECRET`. Em produção, segredo vai pra secret manager + rotação manual (re-deploy + atualização do equipamento).

3. **PREMISSA**: Janela de check-in considera apenas `[startsAt - before, startsAt + after]`. Não consulta `endsAt + noShowGraceMinutes`. Para cenários onde o cron pode marcar NO_SHOW **antes** do paciente chegar dentro da janela `after`, a reversão automática só funciona se `checkInWindowAfterMin > durationMinutes + noShowGraceMinutes` — admin precisa configurar conscientemente.

4. **PREMISSA**: Equipamento não envia assinatura HMAC do payload, apenas o segredo no header. Suficiente para o protocolo do ControliD; se mudarmos de fornecedor, vale reforçar com HMAC.

5. **PREMISSA**: Cadastro do `idfaceUserId` no paciente continua manual (presencial — o admin/recepção captura no equipamento e digita no admin web). Endpoint dedicado virá na Sessão 07 ou junto com o admin Next.js.

6. **PREMISSA**: Não testamos o caso de **2 appointments válidos simultaneamente** (paciente com Fisio + Avaliação na mesma janela) — o picker pega o mais próximo de `now`. Em produção, a chance é baixíssima (paciente não tem 2 agendamentos sobrepostos por causa do `PATIENT_CONFLICT` no create), então OK.

---

## 5. Stats da sessão

| Métrica        | Antes | Depois                                         |
| -------------- | ----- | ---------------------------------------------- |
| Endpoints      | 42    | **43** (+1 webhook)                            |
| Modelos Prisma | 15    | **16** (+IdfaceEvent)                          |
| Migrations     | 7     | **8** (+phase4_idface_events)                  |
| Testes         | 86    | **101** (+8 match-appointment + 7 integration) |
| Suites         | 9     | **11**                                         |
| Módulos NestJS | 9     | **10** (+integrations/idface)                  |

Commits: 2 (Fase 4 completa + SESSION-06-REPORT).

---

## 6. Próximos passos sugeridos

**Fase 5 — Prontuário e protocolo** (CLAUDE.md §10 Fase 5):

1. Schema:
   - `Protocol { id, patientId, professionalId, planId, totalSessions, sessionsPerWeek, diagnosis, observations, suggestedEquipments[] }`
   - `MedicalRecord { id, patientId, professionalId, appointmentId?, content, attachments[] }`
   - `Attachment { id, ... }` ou JSON inline. Decidir.
2. Endpoints:
   - `POST /protocols` (PROF criando na avaliação).
   - `GET /patients/:id/protocols`.
   - `POST /appointments/:id/medical-record` (PROF registra evolução por sessão).
   - `GET /patients/:id/medical-records` (PROF/ADMIN, paciente vê os próprios?).
3. Tests + smoke.

**Outras frentes possíveis (mais úteis para destravar produto)**:

- **Storage interface** para anexos de prontuário (S3/R2). CLAUDE.md §2.2 fala da abstração `IStorageProvider`.
- **Início do admin web** (Next.js) — primeiras telas (login + listagem de pacientes/agendamentos). Permite a clínica enxergar o sistema funcionando.

**Fase 6 (Pagar.me) e Fase 7 (notifications)** seguem no roadmap mas dependem de decisões comerciais com a clínica (qual plano Pagar.me, qual provider de WhatsApp).
