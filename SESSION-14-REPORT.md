# Sessão 14 — Mobile: o loop do paciente (agendar, confirmar, cancelar)

Data: 2026-05-20
Branch: `main`
Escopo: fechar o ciclo de autoatendimento do paciente no app. Antes desta sessão o mobile só **consultava** Agenda e Planos — quem agendava era a recepção pelo admin. Agora o paciente **agenda, confirma presença e cancela** sozinho.

---

## 1. Entregue

### 1.1 Backend — catálogo visível ao paciente

- `GET /services` e `GET /services/:id` ganharam `UserRole.PATIENT` no `@Roles`.
- Motivo: o app precisa resolver `serviceId → nome do serviço` para exibir "Fisioterapia" em vez de um cuid. O catálogo de modalidades não é sensível e já é escopado por unidade pelo interceptor.
- Única mudança de API da sessão — um decorator. Nenhuma migration.

### 1.2 Mobile — tela de agendamento (`app/agendar.tsx`)

Rota modal (`presentation: 'modal'`), assistente em 3 passos numa única tela:

1. **Plano** — lista os planos `ACTIVE` do paciente (`GET /me/plans`), cada um com nome do serviço e saldo (sessões restantes para PACKAGE, quota semanal para SUBSCRIPTION).
2. **Dia** — faixa horizontal com os próximos 14 dias, no fuso `America/Sao_Paulo`.
3. **Horário** — slots gerados pela API (`GET /schedules/slots?serviceId=&date=`).

Confirmar dispara `POST /appointments` com `{ patientId, serviceId, planId, startsAt }`. Em sucesso invalida as queries `me/appointments` e `me/plans` e fecha o modal. Erros de capacidade do §4.3 (slot cheio, equipamento, plano esgotado) chegam como `ApiError` e são exibidos na própria tela.

### 1.3 Mobile — ações na Agenda (`app/(tabs)/agenda.tsx`)

- Botão **"Agendar nova sessão"** no topo → abre o modal.
- Card de agendamento agora mostra o **nome do serviço** (antes só data/hora/status).
- Ações por card, só para sessões **futuras**:
  - `SCHEDULED` → **Confirmar presença** (`POST /appointments/:id/confirm`) + **Cancelar**.
  - `CONFIRMED` → **Cancelar**.
- Cancelar pede confirmação via `Alert` nativo, avisando da regra de prazo (dentro do prazo a sessão volta ao plano; fora, é descontada — §4.5).

### 1.4 Housekeeping

- `expo-env.d.ts` saiu do versionamento (é gerado pelo Expo a cada comando). Adicionado o `.gitignore` que o próprio Expo CLI mantém. Typecheck confirmado sem o arquivo — `expo/tsconfig.base` já traz os tipos.

---

## 2. Smoke test (fluxo completo do paciente, API real)

```
admin login                                              ok
service: PACKAGE, active=true
business-hours: 7 dias 08:00–18:00
patient criado + convite gerado + senha definida         ok
plan ACTIVE criado                                       ok
--- como PATIENT ---
GET /services            -> HTTP 200      (antes: 403)
GET /me/plans            -> 1 plano
GET /schedules/slots     -> 12 slots (2026-05-27)
POST /appointments       -> status=SCHEDULED
POST .../confirm         -> status=CONFIRMED
POST .../cancel          -> status=CANCELLED
GET /me/appointments     -> 1 agendamento
```

`GET /services` como PATIENT passou de **403 → 200** — confirma a mudança de autorização. O ciclo agendar → confirmar → cancelar roda ponta a ponta.

---

## 3. Critérios de aceite

```
pnpm --filter @rpx/api    exec tsc --noEmit   → EXIT 0
pnpm --filter @rpx/mobile exec tsc --noEmit   → EXIT 0
pnpm --filter @rpx/mobile exec expo export --platform web
  → Web Bundled  |  entry-*.js 1.05 MB  |  Exported: dist
```

---

## 4. Decisões técnicas

| Decisão                               | Escolha                            | Por quê                                                                                                |
| ------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Catálogo para o paciente              | Liberar `GET /services` p/ PATIENT | Mais simples que enriquecer `/me/plans` com o nome do serviço; catálogo não é dado sensível.           |
| Agendamento como modal de passo único | Uma tela, 3 seções progressivas    | Wizard multi-tela seria navegação demais para 3 escolhas. Seções aparecem conforme a anterior é feita. |
| Slots sem filtro de capacidade        | Mostrar todos os slots da grade    | `GET /schedules/slots` gera da grade; o `POST` valida o §4.3 transacionalmente. O erro vira mensagem.  |
| Confirmar presença no app             | Incluído junto do cancelar         | `POST /appointments/:id/confirm` já aceitava PATIENT; completa o loop de ações do card sem custo.      |
| `expo-env.d.ts` fora do git           | Seguir a convenção do Expo         | É 100% gerado; `expo/tsconfig.base` supre os tipos. Evita ruído de diff a cada comando do Expo.        |

---

## 5. Premissas em aberto

> Adições às já vigentes (Sessões 01-13).

1. **PREMISSA**: A tela de agendamento **não pré-marca equipamentos sugeridos** (§4.4). O `POST` envia `equipmentIds: []`. Quando o protocolo clínico sugerir equipamentos, a tela precisará de uma seção de equipamentos.
2. **PREMISSA**: Os slots exibidos **não refletem capacidade restante** — um slot cheio só é recusado no `POST`. UX poderia consultar disponibilidade real, mas isso exige um endpoint novo (slots + contagem de ocupação).
3. **PREMISSA**: Sem **pull-to-refresh** na Agenda; a atualização vem da invalidação de query após agendar/cancelar/confirmar.
4. **PREMISSA**: O fluxo ainda não foi exercido em **emulador/device** — validado por `expo export` (web) + smoke test de API.
5. **PREMISSA**: Onboarding via convite (deep link `rpxexpert://`) e push notifications continuam pendentes (Sessão 13, premissas 2 e 3).

---

## 6. Stats da sessão

| Métrica                  | Antes                            | Depois                                              |
| ------------------------ | -------------------------------- | --------------------------------------------------- |
| Telas mobile             | 4 (index, login, agenda, planos) | **5** (+agendar)                                    |
| Ações do paciente no app | só leitura                       | **agendar, confirmar, cancelar**                    |
| Endpoints `/me/*` usados | 2                                | 2 + `/services` + `/schedules/slots` + 3 de escrita |

Commits: 1 (Sessão 14) + 1 (SESSION-14-REPORT).

---

## 7. Próximos passos sugeridos

**Mobile — completar o app do paciente:**

1. Onboarding via convite (deep link `rpxexpert://`, criar senha no app).
2. Registrar Expo push token no login (prepara a Fase 7).
3. Seção de equipamentos sugeridos na tela de agendar (quando houver protocolo).
4. Build em emulador/device para validar fora do export web.

**Backend — fases restantes do roadmap:**

- Fase 6 (Pagar.me) — cobrança de PACKAGE + assinatura de SUBSCRIPTION.
- Fase 7 (Notificações) — Expo Push + WhatsApp; envio automático do convite.
- Fase 8 (Hardening) — CI (GitHub Actions), observabilidade, rate limiting.

Recomendação: o paciente agora fecha o próprio ciclo de agendamento. O maior valor pendente é **Fase 6 (Pagar.me)** — sem cobrança real, os planos são criados manualmente como `ACTIVE`. Alternativamente **Fase 7**, que automatiza o convite e adiciona lembretes (depende de contas/decisões com a clínica).
