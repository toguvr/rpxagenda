# Sessão 08 — `apps/admin` bootstrap (Next.js + login + agenda + pacientes)

Data: 2026-05-19
Branch: `main`
Escopo: tirar `apps/admin` do placeholder. Subir Next.js 15 com login, layout autenticado, listagem de pacientes e agenda do dia consumindo a API já existente. Visualização real do sistema funcionando, end-to-end.

---

## 1. Entregue

### 1.1 Setup técnico

- **Next.js 15** (App Router) + **React 19** + **TypeScript** estrito.
- **Tailwind 3** importando `brandColors` direto do `@rpx/shared` — preto `#000000` + ciano `#00BCD4` aplicados consistentemente.
- `next.config.ts` com `transpilePackages: ['@rpx/shared']` — admin consome o pacote workspace sem build prévio.
- Dev server em **porta 4000** (`next dev -p 4000`), API segue em 3333.
- `tsconfig.json` com `paths: { "@/*": ["./src/*"] }` + `moduleResolution: bundler` + `strict: true`.
- `eslint config` ignora `apps/admin/next-env.d.ts` (auto-gerado pelo Next); lint-staged passa `--no-warn-ignored` para evitar falso positivo.

### 1.2 Auth client (`src/lib/`)

- **`auth.ts`**: `saveSession`, `getAccessToken`, `getRefreshToken`, `getCurrentUser`, `clearSession`, `isAuthenticated`. Storage em `localStorage`.
- **`api.ts`**: `api()` wrapper com:
  - Injeta `Authorization: Bearer <accessToken>` automaticamente.
  - **Refresh automático em 401**: chama `/auth/refresh` com o refresh atual, salva novos tokens, refaz a request original 1 vez. Se refresh falhar → `clearSession` + redirect `/login`.
  - `ApiError` tipada com `{ status, code, message, details }` (mapeia o filtro global da API).
  - Helpers `login(email, password)` e `logoutApi()`.

### 1.3 Páginas

| Rota                            | Quem        | Conteúdo                                                                                                                                                |
| ------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                             | qualquer    | Redireciona para `/appointments` (auth) ou `/login`                                                                                                     |
| `/login`                        | público     | Form com brand mark em ciano sobre fundo preto. Trata `ApiError`.                                                                                       |
| `/(authenticated)/layout`       | autenticado | Sidebar preto + ciano com nav (Agenda, Pacientes), nome do usuário, botão Sair. Redirect client-side para `/login` se não autenticado.                  |
| `/(authenticated)/appointments` | autenticado | Filtro de data (default hoje). Tabela horário—paciente—serviço—status com badges coloridas. Resolve nomes de paciente/serviço via lookup do mapa local. |
| `/(authenticated)/patients`     | autenticado | Busca local (nome/CPF/email). Tabela nome—CPF formatado—telefone—email—badges "acesso cadastrado" + "iDFace".                                           |

### 1.4 Identidade visual aplicada

Cores derivadas do logo (preto + ciano) usadas em:

- Sidebar com fundo `brand.bgDark` + accent `brand.cyan` no item ativo.
- Logo placeholder no canto: quadrado `brand.cyan` com "R" branco.
- Botões primários `brand.cyan` + hover `brand.cyanDark`.
- Badges de "ativo" / "cadastrado" em `brand.cyanLight` + texto `brand.cyanDark`.

### 1.5 Smoke test ponta-a-ponta

```
1. Subir API: pnpm --filter @rpx/api dev → 3333 OK
2. Subir admin: pnpm --filter @rpx/admin dev → 4000 OK
3. GET / → 200 (loading + redirect)
4. GET /login → 200 + renderiza "RPX Expert"
5. POST /auth/login no API com admin do seed → 200 com tokens
6. CORS preflight OPTIONS /auth/login (Origin localhost:4000) → 204
   com Allow-Origin=http://localhost:4000, Allow-Credentials=true
7. GET /patients com Bearer → 200 com lista
```

---

## 2. Decisões técnicas

| Decisão                              | Escolha                                  | Por quê                                                                                                             |
| ------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Next.js 15 + React 19                | Versão major estável atual               | Sem ganho real em ficar no 14. Server Components úteis no futuro.                                                   |
| Storage de tokens                    | `localStorage`                           | Admin é uso interno, fetch cross-origin simples. **PREMISSA**: migrar para cookies httpOnly em sessão de hardening. |
| Refresh automático                   | Loop simples no `api()` wrapper, 1 retry | Padrão. Evita usuário sair toda hora; sem expor lógica para cada página.                                            |
| `transpilePackages: ['@rpx/shared']` | Direto na config                         | Permite Next compilar TS do workspace sem build intermediário.                                                      |
| Sem Shadcn/UI                        | Vanilla Tailwind + utility classes       | Bootstrap mais rápido; podemos adotar Shadcn quando precisar de modal/dialog/select complexos.                      |
| Sem React Query                      | `useEffect` direto + `useState`          | Simples por agora. Quando tivermos mutations + cache invalidation, vale trazer TanStack Query.                      |
| Sem auth context global              | Tudo via `localStorage` getter           | Reduz boilerplate; cada página/componente busca quando precisa. Se virar pesado, criar `AuthProvider`.              |
| Estilo da agenda                     | Tabela simples                           | Layout calendário (timeline) fica para uma sessão dedicada de UI.                                                   |

---

## 3. Premissas em aberto

> Adições às já vigentes (Sessões 01-07).

1. **PREMISSA**: tokens em `localStorage` — vulnerável a XSS. Para o admin (uso interno, sem upload de conteúdo externo nem rich text editor), risco é baixo. Para o mobile do paciente (Fase futura), também `expo-secure-store`. Em hardening web, migrar para httpOnly cookies + CSRF token.

2. **PREMISSA**: Layout calendar/timeline para a agenda fica para sessão dedicada. Tabela atual é boa para listagem mas não para visualizar conflitos visualmente.

3. **PREMISSA**: Sem internacionalização — strings PT-BR hardcoded. Quando expandir, virar `next-intl` ou similar.

4. **PREMISSA**: Sem dark mode. CSS já tem cores definidas para fundo escuro (sidebar) mas o conteúdo principal é light. Tema único.

5. **PREMISSA**: Páginas usam `'use client'` direto. Não há SSR nem prefetch — todas as fetches acontecem no client após o componente montar. Para o admin (uso interno autenticado), aceitable; se quisermos SEO/preview, migrar para Server Components onde der.

6. **PREMISSA**: Sem teste automatizado do admin nesta sessão (apenas smoke manual). Para a próxima evolução do admin, considerar Playwright para e2e.

---

## 4. Stats da sessão

| Métrica              | Antes     | Depois                                      |
| -------------------- | --------- | ------------------------------------------- |
| Apps com código real | 1 (`api`) | **2** (`api`, `admin`)                      |
| Páginas admin        | 0         | **4** (/, /login, /appointments, /patients) |
| Arquivos novos       | —         | 11 (admin)                                  |
| Testes API           | 112       | 112 (sem mudança)                           |

Commits: 1 (admin completo) + 1 (SESSION-08-REPORT).

---

## 5. Como rodar localmente

```bash
# Setup do zero (assumindo já tem postgres rodando via docker compose)
pnpm install

# Em um terminal:
pnpm --filter @rpx/api dev
# → API em http://localhost:3333

# Em outro terminal:
cp apps/admin/.env.example apps/admin/.env.local
pnpm --filter @rpx/admin dev
# → Admin em http://localhost:4000

# Login com o admin do seed:
# email: admin@rpxexpert.local
# senha: RpxAdmin@2026
```

---

## 6. Próximos passos sugeridos

**Continuação natural do admin (Sessão 09):**

1. **Cadastro de paciente**: form `/patients/new` com CPF/email/etc, chamando `POST /patients`. Botão "Gerar convite" mostra o token + URL pronto pra copiar.
2. **Detalhe de paciente** (`/patients/[id]`): perfil, planos (`GET /patients/:id/plans`), agendamentos (`GET /appointments?patientId=...`), prontuários (`GET /patients/:id/medical-records`).
3. **Criar agendamento**: dropdown de paciente + serviço + slots disponíveis do dia (`GET /schedules/slots`).
4. **Ações nos appointments**: confirm / check-in / cancel / revert-consumption diretamente da tabela.
5. **Layout calendar/timeline** real para a agenda.

**Outras frentes:**

- **A — Storage real** (`IStorageProvider`): pre-signed upload pra anexos de prontuário. ~1 sessão.
- **C — Fase 6 (Pagar.me)**: cobrança e assinatura recorrente.
- **D — Fase 7 (Notifications)**: lembretes Expo Push + WhatsApp.
- **E — Hardening/CI**: GitHub Actions + observabilidade + rate limiting.

A escolha entre "continuar admin" vs "voltar pra backend" depende do feedback que a clínica der vendo o admin atual.
