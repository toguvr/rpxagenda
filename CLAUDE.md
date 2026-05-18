# CLAUDE.md — RPX Expert

> **Constituição do projeto.** Este arquivo é a fonte da verdade sobre arquitetura, regras de negócio e convenções. Toda decisão técnica ou de produto deve ser consistente com este documento. Quando houver conflito entre uma instrução pontual e este arquivo, este arquivo prevalece — discuta antes de alterá-lo.

---

## 1. Identidade do Projeto

- **Nome:** RPX Expert
- **Slug técnico:** `rpx-expert`
- **Domínio de negócio:** Clínica de saúde da coluna combinando fisioterapia, RPG/pilates e musculação terapêutica
- **Localização:** Brasil (PT-BR, fuso `America/Sao_Paulo`, moeda BRL)
- **Identidade visual:** Preto (#000000) + ciano (#00BCD4 aproximado do logo) sobre fundos claros/escuros conforme contexto
- **Stack proprietário:** monorepo com backend, mobile (paciente) e admin (web)

---

## 2. Arquitetura e Stack

### 2.1 Componentes

| Componente | Stack | Responsabilidade |
|---|---|---|
| `apps/api` | NestJS + Prisma + PostgreSQL | API REST, regras de negócio, integrações |
| `apps/mobile` | Expo + Expo Router + NativeWind | App do paciente (iOS/Android) |
| `apps/admin` | Next.js (App Router) + Tailwind + Shadcn/UI | Painel administrativo web |
| `packages/shared` | TypeScript puro | Tipos, enums, validações Zod compartilhadas |

### 2.2 Integrações externas

- **Pagamentos:** Pagar.me (assinaturas recorrentes para musculação, cobrança avulsa para pacotes de fisio)
- **Biometria facial:** iDFace ControliD (via webhook HTTP — equipamento envia eventos para o backend)
- **Push notifications:** Expo Notifications
- **WhatsApp:** abstrato via interface `IWhatsAppProvider` (implementação inicial Z-API, trocável)
- **Storage:** abstrato via interface `IStorageProvider` (S3 ou Cloudflare R2)

### 2.3 Princípios arquiteturais

- **Domain-driven modular monolith no backend.** Módulos NestJS por bounded context: `auth`, `patients`, `professionals`, `plans`, `services`, `equipments`, `schedules`, `appointments`, `medical-records`, `payments`, `check-ins`, `notifications`, `integrations/idface`, `integrations/pagarme`, `integrations/whatsapp`.
- **Multi-unit ready desde o dia 1.** Todas as entidades centrais carregam `unitId` (FK para `Unit`). MVP roda com 1 unidade, mas o schema, queries e middlewares de tenant já assumem N. Nunca usar dados globais "sem unidade".
- **Provider pattern para integrações.** Toda integração externa esconde-se atrás de uma interface. Trocar Pagar.me, Z-API ou ControliD não deve quebrar a regra de negócio.
- **Idempotência em webhooks.** Todo endpoint que recebe webhook (Pagar.me, iDFace) deve ser idempotente via chave única do evento.
- **Auditoria.** Operações sensíveis (criação/edição de prontuário, alteração de plano, no-show liberado, cancelamento fora do prazo) geram registro em `AuditLog`.

---

## 3. Glossário de Domínio

| Termo | Definição |
|---|---|
| **Paciente** | Pessoa atendida na clínica. Pode ter múltiplos planos ativos simultaneamente (ex: pacote de fisio + assinatura de musculação). |
| **Profissional** | Fisioterapeuta, educador físico, etc. Atende sessões, mas **não há vínculo paciente-profissional fixo** — qualquer profissional habilitado pode atender qualquer paciente do serviço. |
| **Serviço** | Modalidade oferecida (Fisioterapia, Musculação, RPG, Pilates, Avaliação). Cada serviço tem duração própria. |
| **Equipamento** | Recurso físico finito necessário para certas sessões (ex: maca, reformer, bola suíça). Bloqueia agendamentos quando esgotado. |
| **Plano** | Contrato comercial vinculado a um paciente. Dois tipos: `PACKAGE` (pacote fechado de X sessões com validade) e `SUBSCRIPTION` (mensalidade recorrente com limite semanal). |
| **Protocolo** | Plano clínico definido pelo profissional na avaliação. Define quantas sessões totais, frequência sugerida e equipamentos sugeridos. |
| **Sessão / Agendamento** | Slot reservado para um paciente em um horário, com um serviço e equipamentos opcionais. |
| **Slot** | Janela de horário disponível na grade da clínica (gerada dinamicamente a partir da duração do serviço + horário de funcionamento + limites). |
| **Check-in** | Confirmação de presença do paciente, feita via reconhecimento facial no totem iDFace ao chegar na clínica. |
| **No-show** | Paciente não compareceu e não cancelou. Desconta sessão por padrão, mas admin pode reverter. |

---

## 4. Regras de Negócio Centrais

### 4.1 Planos

#### 4.1.1 Tipos

- **`PACKAGE` (pacote de sessões):** usado para Fisioterapia, RPG, Pilates. Cliente compra N sessões (ex: 20) com validade (ex: 120 dias). Cada sessão consumida decrementa o saldo. Quando saldo = 0 ou validade expira, plano fica `EXPIRED`.
- **`SUBSCRIPTION` (assinatura recorrente):** usado para Musculação. Cliente paga mensalidade e tem direito a X agendamentos por semana (ex: 3x/semana). Reset toda **segunda-feira 00:00** (fuso Brasília).

#### 4.1.2 Múltiplos planos por paciente

Um paciente pode ter, simultaneamente, vários planos ativos de naturezas diferentes (ex: 1 pacote de fisio + 1 assinatura de musculação). Ao agendar, o sistema escolhe o plano correto pela combinação `(patient, service)`.

#### 4.1.3 Cancelamento de assinatura

Assinatura pode ser cancelada a qualquer momento. Direitos seguem até o fim do ciclo já pago. Não há proporcionalidade/estorno parcial.

### 4.2 Serviços e Duração

Cada `Service` tem `durationMinutes` próprio. Valores iniciais:

| Serviço | Duração | Tipo de plano aceito |
|---|---|---|
| Fisioterapia | 50 min | PACKAGE |
| Avaliação | 90 min | PACKAGE (consome 1 sessão) ou avulsa |
| Musculação | 60 min | SUBSCRIPTION |
| RPG | 50 min | PACKAGE |
| Pilates | 50 min | PACKAGE |

Slots na grade são gerados **por serviço**, respeitando a duração. A grade da clínica não é "de hora em hora fixa" — ela é calculada dinamicamente.

### 4.3 Limites de Capacidade (regra mais crítica do sistema)

Um agendamento só é aceito se TODOS os limites abaixo passarem na validação atômica:

1. **Limite do serviço por slot** — ex: Fisioterapia aceita até 5 pacientes simultâneos no mesmo horário.
2. **Limite global do horário** — ex: clínica aceita até 15 pacientes simultâneos no total (somando todos os serviços) — opcional, configurável.
3. **Limite de equipamentos** — para cada equipamento exigido por essa sessão, deve haver inventário disponível no horário sobreposto.
4. **Limite do plano do paciente** — saldo do pacote > 0 OU quota semanal da assinatura não esgotada.
5. **Antecedência mínima de agendamento** — configurável por serviço (default 1h).
6. **Sem conflito do paciente** — paciente não pode ter outro agendamento ativo no mesmo horário.

Essa validação é **transacional** (Postgres advisory lock por `(unitId, serviceId, startsAt)` ou `SERIALIZABLE`) para evitar race condition em agendamentos simultâneos. Nunca validar com `SELECT` solto e depois `INSERT` — sempre dentro de transação com lock.

### 4.4 Equipamentos (regra híbrida)

- O **protocolo** define equipamentos *sugeridos* para o paciente (ex: "sempre maca").
- No **momento do agendamento**, o sistema pré-marca os equipamentos sugeridos, mas o paciente (ou admin) pode adicionar/remover.
- Cada equipamento tem `totalQuantity` (estoque físico) e `unitId`.
- A validação de equipamento é: para cada equipamento `E` desse agendamento, contar quantos agendamentos `ATIVOS` no mesmo slot `[startsAt, endsAt)` consomem `E`. Se `count + 1 > totalQuantity`, bloqueia.
- Equipamentos só são liberados quando o agendamento vira `CANCELLED` ou `NO_SHOW` (sem reversão).

### 4.5 Cancelamento e No-show

- **Antecedência mínima para cancelar sem penalidade:** configurável por serviço (`Service.cancellationLeadMinutes`, default 240 = 4h).
- **Cancelar dentro do prazo:** sessão volta para o saldo do plano (se PACKAGE) ou não conta para a quota semanal (se SUBSCRIPTION).
- **Cancelar fora do prazo:** sessão é descontada como se tivesse ocorrido. Admin pode reverter manualmente.
- **No-show:** detectado automaticamente por job — agendamento `CONFIRMED` sem check-in até `endsAt + graceMinutes` (default 15) vira `NO_SHOW`. Desconta do plano. Admin pode reverter via dashboard, e a reversão é auditada.

### 4.6 Check-in via iDFace ControliD

- **Cadastro biométrico:** feito presencialmente na primeira visita do paciente, pelo admin/recepção, diretamente no equipamento iDFace. Após cadastro, sistema vincula `Patient.idfaceUserId` (ID retornado pelo equipamento).
- **Fluxo de check-in:**
  1. Paciente chega na clínica, faz reconhecimento facial no totem.
  2. iDFace envia webhook HTTP para `POST /webhooks/idface/access-event` com `{ userId, timestamp, deviceId }`.
  3. Backend identifica o paciente, busca agendamentos do dia em janela `[agora - 30min, agora + 15min]`.
  4. Se houver agendamento elegível, marca `Appointment.checkedInAt`, libera acesso (resposta 200 com flag de autorização para o equipamento).
  5. Se não houver, registra evento como `ACCESS_DENIED` em `IdfaceEvent` e responde negando (resposta com flag de negação).
- **Tolerância padrão:** 30min antes / 15min após o horário do agendamento — configurável por serviço.
- **Idempotência:** webhook usa `(deviceId, timestamp, userId)` como chave única para evitar duplicidade.

### 4.7 Pagamentos (Pagar.me)

- **PACKAGE:** cobrança única no ato da venda. Pode ser cartão, PIX ou boleto. Plano só fica `ACTIVE` após `paid` confirmado via webhook.
- **SUBSCRIPTION:** assinatura recorrente mensal Pagar.me. Falha de cobrança → plano vai para `PAST_DUE` (3 dias de tolerância), depois `SUSPENDED` (bloqueia novos agendamentos, mas mantém os já marcados).
- **Webhooks Pagar.me** em `POST /webhooks/pagarme` — idempotentes por `event.id`.

---

## 5. Modelo de Dados (Prisma — alto nível)

> Modelo conceitual. O schema real fica em `apps/api/prisma/schema.prisma`. Toda mudança no modelo é refletida aqui também.

```prisma
// Identidade e multi-unidade
Unit { id, name, timezone, address, ... }
User { id, email, passwordHash, role: ADMIN | PROFESSIONAL | PATIENT, unitId }

// Pessoas
Patient {
  id, userId?, unitId,
  fullName, cpf, birthDate, phone, email,
  idfaceUserId?, // vinculado após cadastro biométrico
  emergencyContact, notes,
  createdAt, updatedAt
}
Professional {
  id, userId, unitId,
  fullName, registry (CREFITO/CREF), services: Service[]
}

// Catálogo
Service {
  id, unitId,
  name, type: FISIO | MUSCULACAO | RPG | PILATES | AVALIACAO,
  durationMinutes, slotCapacity,
  cancellationLeadMinutes, schedulingLeadMinutes,
  checkInWindowBeforeMin, checkInWindowAfterMin,
  acceptedPlanType: PACKAGE | SUBSCRIPTION
}
Equipment {
  id, unitId, name, totalQuantity
}
ServiceEquipment { serviceId, equipmentId } // equipamentos possíveis por serviço

// Grade de horários
BusinessHours { id, unitId, weekday, opensAt, closesAt }
ScheduleException { id, unitId, date, type: CLOSED | CUSTOM, opensAt?, closesAt?, reason }

// Planos
Plan {
  id, patientId, unitId, serviceId,
  type: PACKAGE | SUBSCRIPTION,
  status: PENDING_PAYMENT | ACTIVE | PAST_DUE | SUSPENDED | EXPIRED | CANCELLED,
  // PACKAGE
  totalSessions?, remainingSessions?, validUntil?,
  // SUBSCRIPTION
  weeklyQuota?, pagarmeSubscriptionId?, nextBillingAt?,
  startsAt, endsAt?,
  createdAt
}

// Protocolo clínico
Protocol {
  id, patientId, professionalId, planId,
  totalSessions, sessionsPerWeek,
  diagnosis, observations,
  suggestedEquipments: Equipment[],
  createdAt
}

// Prontuário / evolução
MedicalRecord {
  id, patientId, professionalId, appointmentId?,
  content (text), attachments: Attachment[],
  createdAt
}

// Agendamento
Appointment {
  id, patientId, unitId, serviceId, planId,
  professionalId?, // pode ser atribuído depois
  startsAt, endsAt,
  status: SCHEDULED | CONFIRMED | CHECKED_IN | COMPLETED | CANCELLED | NO_SHOW,
  equipments: Equipment[],
  checkedInAt?, completedAt?, cancelledAt?,
  cancellationReason?, cancelledBy: USER_ID,
  consumedSession: boolean, // se descontou do plano
  createdAt
}

// Pagamentos
Payment {
  id, planId, amount, status, pagarmeChargeId, paymentMethod,
  paidAt?, failedAt?, rawWebhook (jsonb)
}

// Integrações / auditoria
IdfaceEvent {
  id, patientId?, deviceId, eventAt, accessGranted,
  appointmentId?, rawPayload (jsonb)
}
AuditLog {
  id, actorUserId, action, entity, entityId, before (jsonb), after (jsonb), createdAt
}
```

---

## 6. Autenticação e Autorização

- **JWT access + refresh tokens.** Access curto (15min), refresh longo (30 dias rotacionado).
- **3 papéis:** `ADMIN` (gestão total), `PROFESSIONAL` (vê pacientes, edita prontuário, vê agenda do dia), `PATIENT` (app mobile, só os próprios dados).
- **Mobile = só PATIENT.** Admin web = ADMIN e PROFESSIONAL.
- **Guards do NestJS:** `JwtAuthGuard` global, `RolesGuard` por endpoint, `UnitScopeInterceptor` para garantir que toda query escope por `unitId` do usuário autenticado.
- **Sem auto-cadastro de paciente.** Admin cadastra, sistema gera convite com token de 7 dias, paciente recebe via WhatsApp/email com link para criar senha e baixar o app.

---

## 7. Convenções de Código

### 7.1 Geral

- **TypeScript estrito** em todos os apps. Sem `any`, sem `@ts-ignore` sem justificativa em comentário.
- **Idioma:** código em **inglês** (variáveis, funções, classes). Comentários, mensagens de UI e textos de negócio em **português**.
- **Datas:** sempre `Date` em UTC no banco. Conversão para `America/Sao_Paulo` apenas na fronteira (UI / formatação / regras de "começo de semana"). Usar `date-fns-tz` ou `Temporal` (quando estável).
- **Dinheiro:** centavos (integer) no banco. Nunca `float` para valores monetários.
- **IDs:** `cuid2` ou `uuid v7` — escolher um e padronizar (sugestão: `cuid2`).

### 7.2 Backend (NestJS)

- **Módulos por bounded context**, não por tipo técnico. `appointments/` contém controller, service, dto, prisma queries e tests do contexto.
- **DTOs com `class-validator`** na borda; **Zod** em validações internas/compartilhadas com mobile/admin via `packages/shared`.
- **Service layer puro** (sem decorators HTTP). Toda regra de negócio fica em service, controller só orquestra.
- **Erros:** classes de exceção próprias (`AppointmentSlotFullException`, `EquipmentUnavailableException`, etc) mapeadas para HTTP via filtro global.
- **Testes:** unit tests obrigatórios para regras de capacidade (4.3) e de plano (4.1). E2E para fluxos críticos: agendar, cancelar, check-in.
- **Migrations Prisma:** uma migration por mudança lógica, nome descritivo. Nunca editar migration já commitada.

### 7.3 Mobile (Expo)

- **Expo Router** para navegação (file-based).
- **NativeWind** para estilos (sem StyleSheet manual exceto em casos específicos).
- **React Query** para estado servidor, **Zustand** para estado client global (se necessário).
- **Forms:** `react-hook-form` + Zod resolver.
- **Auth storage:** `expo-secure-store` para tokens.
- **Push:** registrar Expo push token no login e armazenar no backend (`User.expoPushToken`).

### 7.4 Admin (Next.js)

- **App Router** com Server Components onde fizer sentido.
- **Shadcn/UI** + Tailwind. Não criar componentes do zero quando o shadcn cobre.
- **Server Actions** para mutations simples; chamadas REST para integrações complexas.
- **TanStack Table** para listas com filtros pesados (agenda, pacientes, pagamentos).

### 7.5 Compartilhado (`packages/shared`)

- Tipos puros, enums, schemas Zod, constantes de domínio.
- **Zero dependências de framework.** Importável tanto pelo Nest quanto pelo Expo e Next.

---

## 8. Estrutura de Pastas (monorepo)

Sugestão: **pnpm workspaces** + **Turborepo**.

```
rpx-expert/
├── apps/
│   ├── api/                    # NestJS
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── patients/
│   │   │   │   ├── professionals/
│   │   │   │   ├── services/
│   │   │   │   ├── equipments/
│   │   │   │   ├── plans/
│   │   │   │   ├── schedules/
│   │   │   │   ├── appointments/
│   │   │   │   ├── medical-records/
│   │   │   │   ├── check-ins/
│   │   │   │   ├── payments/
│   │   │   │   ├── notifications/
│   │   │   │   └── integrations/
│   │   │   │       ├── idface/
│   │   │   │       ├── pagarme/
│   │   │   │       └── whatsapp/
│   │   │   ├── common/        # guards, interceptors, filters, decorators
│   │   │   ├── prisma/        # PrismaService
│   │   │   └── main.ts
│   │   └── prisma/schema.prisma
│   ├── mobile/                 # Expo (paciente)
│   └── admin/                  # Next.js (admin/profissionais)
├── packages/
│   └── shared/                 # tipos, enums, Zod schemas
├── turbo.json
├── pnpm-workspace.yaml
└── CLAUDE.md                   # este arquivo
```

---

## 9. Decisões em Aberto (premissas a validar)

Itens assumidos por default que precisam ser confirmados com o stakeholder:

1. **iDFace ControliD — modelo de integração:** assumido webhook HTTP push. Validar com a documentação oficial qual modelo de equipamento será usado e se ele suporta webhook real ou se será necessário polling/SDK proprietário.
2. **WhatsApp provider:** Z-API como primeira implementação. Validar custo vs Meta Cloud API oficial.
3. **Storage:** AWS S3 vs Cloudflare R2. Decisão de custo. Interface abstrata permite mudar depois.
4. **Reset semanal da assinatura de musculação:** assumido segunda 00:00 BRT. Validar se a clínica prefere domingo→sábado.
5. **Tolerância de check-in:** 30min antes / 15min depois como default. Validar com a recepção.
6. **Reservas no boleto/PIX:** quando o paciente compra pacote via boleto, o agendamento pode ser feito antes do pagamento confirmar? Default: **não** — plano fica `PENDING_PAYMENT` e só permite agendar após `ACTIVE`.
7. **Cadastro biométrico no app:** descartado para MVP. Será 100% presencial no equipamento iDFace.
8. **Emissão de NF:** não está no MVP. A clínica emite manualmente fora do sistema. Avaliar integração futura (Focus NFe, NFe.io).
9. **LGPD:** dados de prontuário não são criptografados em coluna no MVP, apenas o banco inteiro tem encryption at rest. Avaliar criptografia em coluna em fase 2 dependendo do volume e auditoria desejada.

---

## 10. Roadmap de Implementação (alto nível)

### Fase 0 — Bootstrap (sessão 1 do Claude Code)
- Monorepo pnpm + Turborepo
- `apps/api` NestJS com Prisma conectado a Postgres
- `packages/shared` com tipos base
- Auth básica (JWT) + módulo `users` + `units`
- Seed de 1 unidade + 1 admin

### Fase 1 — Catálogo e cadastros
- Módulos `services`, `equipments`, `professionals`, `patients`
- Admin web: CRUDs desses recursos
- Convite de paciente (geração de token, envio mock)

### Fase 2 — Grade e planos
- Módulo `schedules` (BusinessHours, exceções, geração de slots)
- Módulo `plans` (PACKAGE + SUBSCRIPTION em mock, sem Pagar.me ainda)
- Admin: criar plano para paciente, visualizar grade

### Fase 3 — Núcleo de agendamento (regra 4.3 — coração do sistema)
- Módulo `appointments` com validação transacional
- Algoritmo de disponibilidade considerando serviço + equipamento + plano
- Mobile: tela de agendamento e cancelamento
- Tests unitários e e2e cobrindo conflitos, race conditions, equipamentos esgotados

### Fase 4 — Check-in iDFace
- Módulo `check-ins` + `integrations/idface`
- Webhook de eventos do equipamento
- Job de detecção de no-show
- Admin: dashboard de check-ins do dia, reverter no-show

### Fase 5 — Prontuário e protocolo
- Módulos `protocols` e `medical-records`
- Admin/profissional: criar protocolo na avaliação, registrar evolução por sessão
- Histórico do paciente para o profissional

### Fase 6 — Pagar.me
- `integrations/pagarme`: cobrança avulsa de PACKAGE, assinatura de SUBSCRIPTION
- Webhooks de cobrança paga/falha
- Transição de estado de plano por evento

### Fase 7 — Notificações
- Expo Push: lembrete 24h e 2h antes
- WhatsApp: convite de cadastro, lembretes, cobrança falha

### Fase 8 — Hardening
- Auditoria completa, logs estruturados, observabilidade (OpenTelemetry → algum APM)
- Rate limiting, CORS estrito, headers de segurança
- Deploy: Railway ou AWS (a decidir)

---

## 11. Definição de "Pronto"

Uma feature só é considerada pronta quando:

1. Schema Prisma migrado e commitado.
2. Service com regra de negócio + DTOs validados.
3. Controller com endpoints documentados (Swagger).
4. Testes unitários para a regra core + e2e para o happy path.
5. UI correspondente no mobile/admin (se aplicável).
6. Auditoria registrada se for operação sensível.
7. README do módulo atualizado (quando existir lógica não óbvia).

---

## 12. Estilo de Trabalho com IA

Convenções para sessões com Claude Code neste repositório:

- **Sempre ler este `CLAUDE.md` antes de propor mudanças** que afetem regras de negócio ou arquitetura.
- **Premissas explícitas:** quando o contexto for incompleto, assumir a opção mais defensável e marcar com comentário `// PREMISSA: ...` no código ou `> PREMISSA:` no markdown.
- **Sem código preguiçoso:** não usar `// TODO`, `// implementar depois`, `throw new Error('not implemented')` sem aprovação explícita.
- **Migrations destrutivas exigem confirmação humana** — nunca rodar `prisma migrate reset` ou drops sem perguntar.
- **Ao final de toda sessão técnica relevante**, gerar um `.md` consolidando: o que foi feito, decisões tomadas, premissas assumidas, próximos passos sugeridos.
