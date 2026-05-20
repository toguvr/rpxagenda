# Sessão 11 — Admin: CRUD de serviços + criar plano pela UI

Data: 2026-05-19
Branch: `main`
Escopo: fechar o gap do "100% pela UI" — criar plano sem tocar na API e dar à clínica a tela de catálogo de serviços. Mais um bug de `@UsePipes` corrigido em vários controllers.

---

## 1. Entregue

### 1.1 CRUD de serviços (`apps/admin`)

- **`ServiceForm`** (componente compartilhado new/edit): todos os campos do `Service` — nome, tipo, plano aceito, duração, capacidade por slot, leads de agendamento/cancelamento, janelas de check-in, tolerância de no-show, ativo.
- **`/services`** — listagem (ativos + inativos), badge de status, nome linka para edição.
- **`/services/new`** — `POST /services` com o form compartilhado.
- **`/services/[id]/edit`** — carrega `GET /services/:id`, `PATCH /services/:id`.
- Sidebar ganha o item **"Serviços"**.

### 1.2 Criar plano pela UI

- **`CreatePlanModal`** — acessível pela aba _Planos_ do detalhe do paciente.
- O **tipo do plano é derivado do serviço** escolhido (`acceptedPlanType`) — o admin não escolhe PACKAGE/SUBSCRIPTION manualmente, o que elimina o erro `PLAN_MISMATCH` por construção.
- Campos condicionais: PACKAGE → `totalSessions` + `validUntil`; SUBSCRIPTION → `weeklyQuota`.
- `POST /plans`; em sucesso, o plano novo é prepended na lista local sem refetch.

Com isso, o fluxo do admin é **100% UI**: cadastrar serviço → cadastrar paciente → criar plano → agendar → confirmar/check-in/concluir/cancelar.

### 1.3 Bug corrigido — `@UsePipes` no nível do método

Mesmo padrão da Sessão 04. `@UsePipes(new ZodValidationPipe(schema))` no nível do método roda o pipe em **todos** os parâmetros, incluindo `@Param('id')` — o pipe tenta parsear a string do id com um schema de objeto e devolve `400 "Expected object, received string"`.

Afetava o `PATCH` com `:id` de **services, patients, professionals, equipments**. Todos corrigidos movendo o pipe para `@Body(new ZodValidationPipe(...))` inline; import de `UsePipes` removido dos quatro controllers.

> O `auth.controller.ts` também usa `@UsePipes`, mas seus handlers (login/refresh/logout) **não têm `@Param`** — só `@Body`. Lá é seguro, não foi alterado.

### 1.4 Shared — `noShowGraceMinutes`

O campo existia no Prisma desde a Fase 3 mas nunca foi exposto nos Zod schemas. Adicionado a `createServiceRequestSchema`, `updateServiceRequestSchema` (via `.partial()`) e `serviceResponseSchema`. Agora o `ServiceForm` consegue ler e gravar esse campo.

---

## 2. Smoke test

API + admin no ar:

```
POST /services {..., noShowGraceMinutes:20} → 201, campo persistido
PATCH /services/:id {noShowGraceMinutes:25, slotCapacity:6} → 200 (bug corrigido)
PATCH /patients/:id {notes:"..."} → 200 (mesmo bug corrigido)
POST /plans PACKAGE → 201 ACTIVE, remaining=10
112 testes da API seguem passando.
```

---

## 3. Decisões técnicas

| Decisão            | Escolha                                          | Por quê                                                                                                                |
| ------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Tipo do plano      | Derivado do serviço, não escolhido pelo admin    | `Service.acceptedPlanType` já define se é PACKAGE ou SUBSCRIPTION. Deixar o admin escolher só geraria `PLAN_MISMATCH`. |
| ServiceForm        | Componente compartilhado new + edit              | Form tem 11 campos; duplicar seria custoso. `fromService()` mapeia defaults.                                           |
| Criar plano        | Modal, não página                                | Form pequeno e contextual ao paciente. Criar serviço usa páginas (form grande).                                        |
| Plano novo na UI   | Prepend local sem refetch                        | Resposta do `POST` já é o plano completo; evita uma chamada extra.                                                     |
| Fix do `@UsePipes` | Auditei os 5 controllers, corrigi os 4 com `:id` | A causa raiz é conhecida desde a Sessão 04; varri tudo de uma vez para não deixar resíduo.                             |

---

## 4. Premissas em aberto

> Adições às já vigentes (Sessões 01-10).

1. **PREMISSA**: CRUD de **equipamentos** e **profissionais** ainda não tem tela. Equipamentos só importam para serviços que exigem; profissionais ainda nem são atribuídos a appointments. Próxima evolução do admin.
2. **PREMISSA**: Horários de funcionamento (`BusinessHours`) não têm tela — configurar a grade de um serviço ainda exige a API. É o próximo gap real para a clínica operar sozinha.
3. **PREMISSA**: `ServiceForm` não valida no client além de `required`/`min` — autoridade é o Zod da API (mesma decisão das outras telas).
4. **PREMISSA**: Sem `DELETE` de serviço na UI. O backend tem o endpoint (com proteção de FK → 409); a tela pode usar o toggle `active` em vez de excluir.

---

## 5. Stats da sessão

| Métrica           | Antes | Depois                                                    |
| ----------------- | ----- | --------------------------------------------------------- |
| Páginas admin     | 7     | **10** (+/services, +/services/new, +/services/[id]/edit) |
| Componentes admin | 3     | **5** (+ServiceForm, +CreatePlanModal)                    |
| Bug fixes na API  | —     | 4 controllers (`@UsePipes` em PATCH com `:id`)            |
| Testes API        | 112   | 112 (sem regressão)                                       |

Commits: 1 (Sessão 11) + 1 (SESSION-11-REPORT).

---

## 6. Próximos passos sugeridos

**Admin (Sessão 12) — fechar a configuração:**

1. **Tela de horários** (`BusinessHours`) por serviço — sem isso a clínica não gera slots sozinha.
2. CRUD de equipamentos.
3. CRUD de profissionais (cria User PROFESSIONAL junto).
4. Editar paciente.
5. Vincular equipamentos a serviços (`PUT /services/:id/equipments`).

Depois disso a clínica configura e opera **tudo** pela UI — viabiliza um piloto real sem ninguém tocar na API.

**Backend:**

- Storage real (`IStorageProvider`) — anexos de prontuário.
- Fase 6 (Pagar.me).
- Fase 7 (Notificações — envio automático do convite).
- Hardening + CI.

Recomendação: **tela de horários + equipamentos + profissionais** (Sessão 12) — é o que falta para a clínica fazer o setup inicial inteiro pela UI.
