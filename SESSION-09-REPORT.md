# Sessão 09 — Admin: cadastro de paciente + detalhe + convite

Data: 2026-05-19
Branch: `main`
Escopo: continuar `apps/admin` — fechar o ciclo do paciente do ponto de vista do admin: cadastrar, ver detalhe completo, gerar convite de acesso ao app.

---

## 1. Entregue

### 1.1 Componentes utilitários (`src/components/`)

- **`Card`** — seção branca com borda, título e ação opcional no header.
- **`Modal`** — dialog centralizado com backdrop; fecha em `Esc` ou click fora.
- **`CopyButton`** — copia valor para o clipboard com feedback "Copiado ✓".

### 1.2 `/patients/new` — cadastro

- Form com todos os campos do `Patient`: nome, CPF, data de nascimento (`input[type=date]`), telefone, e-mail, contato de emergência, observações.
- `POST /patients` no submit; sucesso → redireciona para `/patients/[id]`.
- **Renderiza os issues de validação Zod** da API campo a campo (ex: "cpf: CPF inválido") — o admin vê exatamente o que corrigir.

### 1.3 `/patients` — atualizada

- Botão **"Novo paciente"** no header.
- Nome do paciente vira link para a página de detalhe.

### 1.4 `/patients/[id]` — detalhe completo

- **Perfil**: 3 cards (Identificação, Acesso ao app, iDFace) + card de Observações condicional.
- **Botão "Gerar convite"**:
  - Só aparece se `hasUserAccount === false`.
  - Desabilitado (com tooltip) se o paciente não tem e-mail.
  - `POST /patients/:id/invites` → abre **Modal** com o token e a URL de redemption, ambos com `CopyButton`. O token é entregue uma única vez (o backend só guarda o hash).
- **Abas**:
  - _Planos_ — `GET /patients/:id/plans`; mostra serviço, tipo, status, saldo (PACKAGE) ou quota usada/total (SUBSCRIPTION), validade.
  - _Agendamentos_ — `GET /appointments?patientId=`; data/hora, serviço, status, ordenado do mais recente.
- Resolve nomes de serviço via lookup de `GET /services?includeInactive=true`.

### 1.5 Detalhe técnico

- Next.js 15: `params` é `Promise` — usei `use(params)` para desembrulhar.
- Todas as páginas client components (`'use client'`), fetch via o `api()` wrapper já existente (Bearer + refresh automático).

---

## 2. Smoke test ponta-a-ponta

API + admin no ar (3333 + 4000):

```
1. POST /patients (form de cadastro) → 201, paciente criado
2. POST /patients/:id/invites → 201, token + expiresAt + redeemPath
3. GET /patients/:id (admin) → 200
4. GET /patients/new (admin) → 200
```

Fluxo completo manual: cadastrar → abrir detalhe → gerar convite → copiar token → (paciente usaria o token no app para `POST /patient-invites/:token/redeem`).

---

## 3. Decisões técnicas

| Decisão           | Escolha                                                         | Por quê                                                                                                                         |
| ----------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Validação do form | Client mínima (`required`, `minLength`) + autoridade no backend | O Zod da API é a fonte da verdade. O form só renderiza os `issues` que voltam. Evita duplicar regras.                           |
| `use(params)`     | API nova do Next 15                                             | `params` virou `Promise` no App Router 15. `use()` é a forma idiomática num client component.                                   |
| Abas              | `useState` local, sem rota                                      | Planos/Agendamentos são do mesmo recurso; não precisa de deep-link por enquanto.                                                |
| Modal de convite  | Token mostrado uma vez, com copy                                | Backend só guarda o hash — não dá pra recuperar depois. O admin tem que copiar na hora (ou gerar outro).                        |
| `redeemUrl`       | `window.location.origin + redeemPath`                           | Placeholder — a URL real do app mobile/redemption virá quando o mobile existir. Por ora aponta pro próprio admin. **PREMISSA**. |

---

## 4. Premissas em aberto

> Adições às já vigentes (Sessões 01-08).

1. **PREMISSA**: A URL de redemption no modal é construída com o origin do admin. Quando o app mobile existir (deep link) ou houver uma landing page de redemption, trocar por essa URL real. O `redeemPath` que o backend devolve já é o caminho correto.

2. **PREMISSA**: Sem confirmação ("tem certeza?") em nenhuma ação ainda. Gerar convite é idempotente-ish (gera vários), cadastro é reversível. Quando vierem ações destrutivas (cancelar, desativar), adicionar confirmação.

3. **PREMISSA**: O detalhe do paciente não tem aba de Prontuários. Foi deixado de fora porque o admin (role ADMIN) pode ler mas a tela de prontuário clínico faz mais sentido no contexto do profissional. Avaliar se entra aqui ou numa view dedicada do profissional.

4. **PREMISSA**: Editar paciente (PATCH /patients/:id) não tem tela ainda — só cadastro. Próxima evolução.

---

## 5. Stats da sessão

| Métrica                             | Antes | Depois                                                                          |
| ----------------------------------- | ----- | ------------------------------------------------------------------------------- |
| Páginas admin                       | 4     | **6** (+/patients/new, +/patients/[id])                                         |
| Componentes admin                   | 0     | **3** (Card, Modal, CopyButton)                                                 |
| Endpoints API consumidos pelo admin | 3     | **7** (+POST /patients, +POST invites, +GET plans, +GET appointments?patientId) |

Commits: 1 (admin Sessão 09) + 1 (SESSION-09-REPORT).

---

## 6. Próximos passos sugeridos

**Continuar admin (Sessão 10):**

1. **Criar agendamento pelo admin**: form com paciente + serviço + data → `GET /schedules/slots` → escolher slot → `POST /appointments`.
2. **Ações inline nos appointments**: botões confirmar / check-in / cancelar / completar direto na tabela da agenda.
3. **Editar paciente** (`/patients/[id]/edit`).
4. **CRUD de catálogo** (serviços, equipamentos, profissionais) — telas de admin.
5. **Layout calendário** (timeline) para a agenda.

**Ou backend:**

- Storage real (`IStorageProvider`).
- Fase 6 (Pagar.me).
- Fase 7 (Notifications + WhatsApp — o convite ganharia envio automático).
- Hardening + CI.

Observação: a Fase 7 (notifications) tem sinergia forte com o que foi feito hoje — quando o admin gera o convite, o ideal é o WhatsApp/e-mail disparar sozinho em vez do admin copiar o token manualmente.
