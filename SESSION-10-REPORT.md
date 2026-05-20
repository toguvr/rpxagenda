# Sessão 10 — Admin: criar agendamento + ações inline na agenda

Data: 2026-05-19
Branch: `main`
Escopo: tornar a agenda do `apps/admin` operacional — criar agendamentos pela UI e executar as transições de status direto na tabela.

---

## 1. Entregue

### 1.1 `/appointments/new` — criação guiada

Fluxo em 3 cards sequenciais:

1. **Paciente e serviço** — dois selects. O select de serviço mostra duração e tipo de plano aceito.
2. **Plano** — aparece quando paciente + serviço estão escolhidos. Carrega `GET /patients/:id/plans`, filtra os **elegíveis**: `serviceId` casa, `status === ACTIVE`, `type === service.acceptedPlanType`. Auto-seleciona se houver só um. Se não houver nenhum, mostra aviso para criar plano antes.
3. **Data e horário** — input de data → `GET /schedules/slots?serviceId=&date=` → grade de botões de slot clicáveis (mostra `localStart`).

`POST /appointments` no fim com `{ patientId, serviceId, planId, startsAt }`. Sucesso → redireciona para o detalhe do paciente. Erros da API (capacity, lead time, etc.) aparecem inline.

### 1.2 `/appointments` — agenda operacional

- Botão **"Novo agendamento"** no header.
- Nome do paciente vira link para o detalhe.
- **Coluna "Ações"** com botões dependentes do status:

| Status                                | Botões                          |
| ------------------------------------- | ------------------------------- |
| `SCHEDULED`                           | Confirmar · Check-in · Cancelar |
| `CONFIRMED`                           | Check-in · Cancelar             |
| `CHECKED_IN`                          | Concluir                        |
| `COMPLETED` / `CANCELLED` / `NO_SHOW` | — (sem ação)                    |

- Confirmar / Check-in / Concluir → `POST /appointments/:id/{confirm,check-in,complete}`.
- Cancelar → abre **Modal** pedindo motivo (opcional) → `POST /appointments/:id/cancel`.
- Após cada ação a lista recarrega; erro de ação aparece num banner no topo.
- Botões desabilitam enquanto a ação está em andamento (`busyId`).

### 1.3 Smoke test ponta-a-ponta

```
Seed via API: serviço Fisioterapia S10 + business hours 7 dias 08-18
              + paciente + plano PACKAGE 20 sessões

/appointments/new → 200
/appointments → 200

POST /appointments (paciente+serviço+plano+slot) → 201 SCHEDULED
POST .../confirm → CONFIRMED
POST .../check-in → CHECKED_IN
POST .../complete → COMPLETED

2º appointment → POST .../cancel {reason} → CANCELLED, consumedSession=false
  (cancelamento dentro do prazo devolveu a sessão)
```

A clínica agora consegue, 100% pela UI: cadastrar paciente → criar plano (via API ainda) → agendar → confirmar/check-in/concluir/cancelar.

---

## 2. Decisões técnicas

| Decisão                                          | Escolha                                          | Por quê                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Form de criação                                  | Página dedicada `/appointments/new`, não modal   | Fluxo de 3 passos com slots é grande demais para modal. Página dá espaço e permite deep-link.                               |
| Filtro de planos elegíveis                       | No client, a partir de `GET /patients/:id/plans` | A API valida de novo no `POST` (PLAN_MISMATCH). O client filtra só para UX — não duplica regra crítica.                     |
| Slots                                            | Botões clicáveis, não dropdown                   | Mais rápido para a recepção: vê todos os horários de uma vez.                                                               |
| Ações inline vs página de detalhe do appointment | Inline na tabela                                 | Operação de recepção é rápida — confirmar/check-in sem sair da agenda. Detalhe do appointment fica para depois se precisar. |
| Cancelamento                                     | Modal com motivo opcional                        | Cancelar é semi-destrutivo; o modal evita clique acidental e captura o `reason` para auditoria.                             |
| Refetch após ação                                | Recarrega a lista inteira do dia                 | Simples e correto. Para muitos appointments, dá pra otimizar com update local; volume de clínica não justifica ainda.       |

---

## 3. Premissas em aberto

> Adições às já vigentes (Sessões 01-09).

1. **PREMISSA**: O admin ainda não cria **plano** pela UI — só agendamento. Para o fluxo ficar 100% sem API manual, falta uma tela de criar plano (provavelmente dentro do detalhe do paciente). Próxima evolução.

2. **PREMISSA**: `/appointments/new` não permite escolher equipamentos. O `POST` aceita `equipmentIds` mas a UI manda vazio. Quando o protocolo sugerir equipamentos, pré-popular aqui.

3. **PREMISSA**: Sem `revert-consumption` na UI (reverter NO_SHOW / cancelamento fora do prazo). O endpoint existe (`POST /appointments/:id/revert-consumption`); a tela fica para quando houver demanda real da recepção.

4. **PREMISSA**: A agenda lista por dia único. Sem visão semanal/timeline. Mantida a tabela; layout calendário continua como item de UI dedicada.

5. **PREMISSA**: Dados de smoke test (serviço Fisioterapia S10 + paciente + plano + 2 appointments amanhã) foram **deixados no banco** de propósito — servem de dados de exemplo ao abrir o admin. Limpar com `prisma migrate reset` se quiser base zerada.

---

## 4. Stats da sessão

| Métrica                             | Antes | Depois                                                                                       |
| ----------------------------------- | ----- | -------------------------------------------------------------------------------------------- |
| Páginas admin                       | 6     | **7** (+/appointments/new)                                                                   |
| Endpoints API consumidos pelo admin | 7     | **12** (+GET /schedules/slots, +POST /appointments, +confirm, +check-in, +complete, +cancel) |

Commits: 1 (admin Sessão 10) + 1 (SESSION-10-REPORT).

---

## 5. Estado geral do projeto (após 10 sessões)

- **`apps/api`**: 51 endpoints, 19 modelos Prisma, 9 migrations, 112 testes (unit + integration).
- **`apps/admin`**: 7 páginas, login + agenda operacional + ciclo completo de paciente.
- **`packages/shared`**: enums, Zod schemas, design tokens — consumido por api e admin.
- **`apps/mobile`**: ainda placeholder.

Fases do roadmap (CLAUDE.md §10):

- ✅ Fase 0 — Bootstrap
- ✅ Fase 1 — Catálogo e cadastros
- ✅ Fase 2 — Grade e planos
- ✅ Fase 3 — Núcleo de agendamento
- ✅ Fase 4 — Check-in iDFace
- ✅ Fase 5 — Prontuário e protocolo
- 🟡 Admin web — em construção (sessões 08-10)
- ⬜ Fase 6 — Pagar.me
- ⬜ Fase 7 — Notificações
- ⬜ Fase 8 — Hardening

---

## 6. Próximos passos sugeridos

**Continuar admin (Sessão 11):**

1. Criar plano pela UI (no detalhe do paciente) — fecha o fluxo sem precisar de API manual.
2. CRUD de catálogo: serviços, equipamentos, profissionais, horários de funcionamento.
3. Editar paciente.
4. Layout calendário/timeline para a agenda.

**Backend:**

- Storage real (`IStorageProvider`) — anexos de prontuário.
- Fase 6 (Pagar.me).
- Fase 7 (Notificações — envio automático do convite por WhatsApp/e-mail).
- Hardening + CI (GitHub Actions).

Recomendação: **criar plano + CRUD de catálogo no admin** (Sessão 11) — depois disso a clínica consegue operar o sistema inteiro sem tocar na API direto, o que permite um piloto real.
