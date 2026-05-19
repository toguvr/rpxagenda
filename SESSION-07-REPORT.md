# Sessão 07 — Fase 5 (Prontuário e Protocolo)

Data: 2026-05-19
Branch: `main`
Escopo: [Fase 5 do roadmap](CLAUDE.md#10-roadmap-de-implementação-alto-nível) — profissional registra o plano clínico (`Protocol`) na avaliação e a evolução por sessão (`MedicalRecord`). Anexos via URL (storage real fica para sessão dedicada).

---

## 1. Entregue

### 1.1 Schema (migration `phase5_protocols_and_records`)

- **`Protocol`** — vínculo `(patientId, professionalId, planId)`; `totalSessions`, `sessionsPerWeek`, `diagnosis`, `observations?`, `active`. Index por `(unitId, patientId, active)` + por `planId`. Regra de negócio: **1 protocolo ATIVO por plano** (validado no service, 409 se já existe).
- **`ProtocolEquipment`** — N:N com `Equipment` (equipamentos sugeridos pelo protocolo, distinto dos sugeridos pelo serviço).
- **`MedicalRecord`** — `content @db.Text` + `attachmentUrls String[]`. `appointmentId` opcional (anotação avulsa OU vinculada a sessão).
- `Protocol` e `MedicalRecord` adicionados a `UNIT_SCOPED_MODELS` → escopo automático.

### 1.2 Endpoints (8 novos)

| Método  | Path                                   | Quem            | O que faz                                                                     |
| ------- | -------------------------------------- | --------------- | ----------------------------------------------------------------------------- |
| `POST`  | `/protocols`                           | PROF, ADMIN     | Cria protocolo na avaliação; bloqueia 2º ativo por plano                      |
| `GET`   | `/protocols/:id`                       | PROF, ADMIN     | Detalhe                                                                       |
| `PATCH` | `/protocols/:id`                       | PROF, ADMIN     | Edita (sessions, diagnosis, observations, active, equipamentos)               |
| `GET`   | `/patients/:patientId/protocols`       | PROF, ADMIN     | Histórico ordenado (active desc, createdAt desc)                              |
| `POST`  | `/medical-records`                     | **PROF apenas** | Registra evolução, com/sem appointment; valida que appointment.patientId casa |
| `PATCH` | `/medical-records/:id`                 | **PROF apenas** | **Apenas o autor** pode editar                                                |
| `GET`   | `/medical-records/:id`                 | PROF, ADMIN     | Detalhe                                                                       |
| `GET`   | `/patients/:patientId/medical-records` | PROF, ADMIN     | Histórico desc                                                                |
| `GET`   | `/me/medical-records`                  | **PATIENT**     | Seus próprios registros                                                       |

(Total acumulado: 43 → **51 endpoints**.)

### 1.3 Regras de negócio

- **Protocol único ativo por plano**: o profissional não consegue criar 2 protocolos ativos para o mesmo `Plan`. Pra mudar conduta, atualiza o existente (PATCH) ou desativa (`active=false`) e cria novo.
- **Autoria do prontuário**: o `MedicalRecord.professionalId` vem do User autenticado (lookup `Professional.userId = user.id`). Apenas esse mesmo profissional pode editar — admin pode ler.
- **Cross-patient appointment**: criar prontuário passando `appointmentId` que pertence a outro paciente → 409.
- **PATIENT vê só os próprios** via `/me/medical-records` (mesma estratégia das outras rotas `/me/*`).

### 1.4 Anexos (`attachmentUrls`)

- Por agora, **URLs externas** validadas por Zod (`z.string().url()`), máximo 20 por registro.
- Implementação de upload via `IStorageProvider` (S3/R2) fica para sessão dedicada. **PREMISSA**: o admin web/mobile vai usar pre-signed URLs do storage e enviar só a URL final para a API.

### 1.5 Testes — 112 passing (12 suites, +11 vs Sessão 06)

| Cenário                                          | Resultado     |
| ------------------------------------------------ | ------------- |
| PROF cria protocolo com equipamentos             | 201           |
| 2º protocolo ativo no mesmo plano                | 409           |
| Listagem por paciente                            | OK            |
| PATIENT tenta criar protocolo                    | 403           |
| PROF registra prontuário em appointment          | 201           |
| PROF edita o próprio                             | 200           |
| PROF cria prontuário avulso (sem appointment)    | 201           |
| Ordem do histórico (createdAt desc)              | OK            |
| PATIENT vê os próprios via `/me/medical-records` | OK            |
| ADMIN lê mas não cria                            | 403 no create |
| `appointmentId` de outro paciente                | 409           |

---

## 2. Decisões técnicas

| Decisão                                            | Escolha                                     | Por quê                                                                                                                                            |
| -------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MedicalRecord.content`                            | `String @db.Text` (free-form/markdown)      | Profissional escreve texto livre por agora. Estruturação (campos clínicos padronizados) pode vir depois sem mudar o que está gravado.              |
| `attachmentUrls`                                   | `String[]` de URLs                          | Sem `IStorageProvider` real ainda. Quando vier, a tabela já segura URLs reais do S3/R2 sem migration.                                              |
| `professionalId` em `MedicalRecord`                | Derivado do `user.id` autenticado           | Evita o profissional impersonar outro. Apenas PROF cria; o lookup é `Professional.userId = user.id`.                                               |
| 1 Protocol ATIVO por Plano                         | Validado no service (não constraint unique) | Constraint unique parcial em Postgres requer `@@index` raw; mantemos lógica simples no service + index normal por planId. Aceitável dado o volume. |
| Edição do prontuário                               | Só o autor                                  | Defesa simples contra adulteração. Para casos onde admin precisa corrigir, futura "anexar comentário" virá depois.                                 |
| `ProtocolEquipment` separado de `ServiceEquipment` | Modelos distintos                           | Spec do CLAUDE.md §4.4: protocolo sugere equipamentos _do paciente_ (clínico), serviço sugere _operacional_. Manter separados permite divergência. |

---

## 3. Premissas em aberto (validar com Augusto)

> Adições às já vigentes (Sessões 01-06).

1. **PREMISSA**: Anexos como URL externa. Implementação real depende de decisão S3 vs Cloudflare R2 (CLAUDE.md §9 item 3). Esta sessão deixou o caminho aberto sem comprometer.

2. **PREMISSA**: Apenas o profissional autor pode editar prontuário. Se houver fluxo de revisão/correção pelo admin (LGPD), virar audit + segunda assinatura. Por ora, simples.

3. **PREMISSA**: `MedicalRecord` não é versionado (PATCH sobrescreve o `content`). Em alguns sistemas clínicos, prontuário é append-only com revisões. Decisão consciente — se virar problema, fácil migrar para append-only com tabela `MedicalRecordVersion`.

4. **PREMISSA**: Paciente vê **todo** seu prontuário pela rota `/me/medical-records`. Em alguns países, o profissional pode marcar notas como "interno" — não implementado. Spec do CLAUDE.md não menciona; PATIENT vê tudo.

5. **PREMISSA**: Protocol pode ser editado livremente pelo profissional (até `active=false`), sem trilha de quem mudou o quê. Se virar requisito LGPD, virar AuditLog automático por mudança de protocol.

6. **PREMISSA**: Não há "agenda do dia" do profissional ainda. Aparece naturalmente quando o admin web for construído — endpoint pronto: `GET /appointments?professionalId=...&fromDate=...&toDate=...`.

---

## 4. Stats da sessão

| Métrica        | Antes | Depois                                                 |
| -------------- | ----- | ------------------------------------------------------ |
| Endpoints      | 43    | **51** (+8)                                            |
| Modelos Prisma | 16    | **19** (+Protocol, +ProtocolEquipment, +MedicalRecord) |
| Migrations     | 8     | **9** (+phase5_protocols_and_records)                  |
| Testes         | 101   | **112** (+11)                                          |
| Suites         | 11    | **12**                                                 |
| Módulos NestJS | 10    | **12** (+protocols, +medical-records)                  |

Commits: 2 (Fase 5 + SESSION-07-REPORT).

---

## 5. Próximos passos sugeridos

Direções possíveis — pesar com Augusto:

**Opção A — Storage real para anexos** (`IStorageProvider`)

- Interface abstrata em `apps/api/src/integrations/storage/`.
- Implementação S3 OU R2 (decisão de §9 do CLAUDE.md).
- Endpoint `POST /storage/sign-upload` que devolve pre-signed URL.
- Admin/mobile faz upload direto pro bucket, manda URL pro POST /medical-records.
- ~1 sessão.

**Opção B — `apps/admin` Next.js inicial**

- Login + layout autenticado + listagem de pacientes/agendamentos.
- Permite a clínica ver o sistema funcionando end-to-end via UI.
- ~1-2 sessões.

**Opção C — Fase 6 (Pagar.me)**

- Cobrança real de PACKAGE + assinatura de SUBSCRIPTION.
- Webhook `/webhooks/pagarme` idempotente por `event.id`.
- Transições de status do plano (PENDING_PAYMENT → ACTIVE → PAST_DUE → SUSPENDED).
- Depende da clínica ter conta Pagar.me ativa. ~1-2 sessões.

**Opção D — Fase 7 (Notifications + WhatsApp invite)**

- Lembretes 24h/2h antes (Expo Push pro mobile, WhatsApp via Z-API).
- `IWhatsAppProvider` interface.
- Lembrete cron + envio quando convite de paciente é gerado.
- ~1-2 sessões.

**Opção E — Hardening/CI/CD**

- GitHub Actions: lint + typecheck + test em PR.
- Pino logs estruturados → output para Loki/Datadog.
- Rate limiting, helmet hardening, CORS estrito.
- ~1 sessão.

Minha recomendação pessoal: **B (admin web)** — destrava a clínica visualizar o sistema e dar feedback real antes de mais backend. Se preferir continuar backend, **A (storage)** completa o módulo de prontuário.
