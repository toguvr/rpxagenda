# Sessão 01 — Bootstrap (Fase 0)

Data: 2026-05-18
Branch: `main`
Escopo: Fase 0 do roadmap em [`CLAUDE.md`](CLAUDE.md#10-roadmap-de-implementação-alto-nível) — fundação técnica do monorepo, API NestJS rodando, auth básico funcional, seed inicial. Zero features de domínio.

---

## 1. O que foi entregue

### Monorepo

- pnpm workspaces + Turborepo, com pipelines `build`, `dev`, `lint`, `typecheck`, `test`.
- `tsconfig.base.json` estrito (com `noUncheckedIndexedAccess`, `noImplicitOverride`), `eslint.config.mjs` (flat config) + Prettier + `.editorconfig` + `.nvmrc` (Node 20.18.0).
- `docker-compose.yml` na raiz com Postgres 16 (porta **5433** — 5432 fica para o Postgres local Homebrew comum em máquinas de dev) + Adminer (8080). Volume nomeado `rpx_pgdata`.
- README raiz com setup do zero, identidade visual e tabela de variáveis de ambiente.

### `packages/shared`

- TypeScript puro (CommonJS para interoperar com Nest, Next e Expo).
- `UserRole` enum espelhando o Prisma (`ADMIN | PROFESSIONAL | PATIENT`).
- Zod schemas: `emailSchema`, `passwordSchema`, `cuidSchema`, `loginRequestSchema`, `refreshRequestSchema`, `authenticatedUserSchema`, `loginResponseSchema` — com types inferidos exportados.
- `design-tokens.ts` com cores do logo (`brand.black = #000000`, `brand.cyan = #00BCD4` + variantes light/dark).

### `apps/mobile`, `apps/admin`

- Placeholders apenas com `package.json` (scripts ecoam mensagem) e `README.md`. Sem código.

### `apps/api` (NestJS)

- **Bootstrap:** Nest 10 + TypeScript estrito, decorator metadata, Helmet, CORS, `enableShutdownHooks`.
- **Config:** `AppConfigModule` global. Validação de env via Zod (`env.schema.ts`). `TypedConfigService` com getter tipado.
- **Logger:** `nestjs-pino` + `pino-pretty` em dev. Redaction de `authorization`, `cookie`, `password`, `refreshToken`, `passwordHash`, `tokenHash`.
- **Filtro global de exceção** (`AllExceptionsFilter`): resposta padronizada `{ statusCode, message, code, details?, path, timestamp }`. Trata `AppException`, `ZodError`, `HttpException`, fallback `INTERNAL_ERROR`.
- **Prisma:** `PrismaService` (módulo global), schema com `Unit`, `User`, `RefreshToken`, `AuditLog`. Migration inicial `20260518224950_init`.
- **Auth:** login + refresh rotation + logout; argon2id; access JWT 15min; refresh 30d armazenado como HMAC-SHA256 (com `JWT_REFRESH_SECRET` dedicado, segredo nunca sai do servidor); rotação atômica em transação; detecção de reuso revoga toda a família de tokens; `JwtAuthGuard` global + `@Public()`; `RolesGuard` + `@Roles()`; `@CurrentUser()`; `UnitScopeInterceptor` (apenas anexa `unitId` ao request — escopo continua sob responsabilidade dos services, ver §10 abaixo).
- **Units:** `GET /units/me`.
- **Health:** `GET /health` público com `SELECT 1` no banco.
- **Swagger:** `/docs` apenas fora de produção, com Bearer auth pré-configurado.
- **Seed idempotente:** 1 unidade matriz + 1 admin a partir de variáveis `SEED_*` com fallback.

### Testes

- `auth.service.spec.ts` com 7 testes unitários cobrindo: login sucesso, senha incorreta, usuário inexistente, rotação válida, rejeição de reuso de refresh rotacionado, refresh inexistente, logout revoga o token. Usa fake in-memory de Prisma (sem precisar de DB para unit test).

### Qualidade

- Husky + lint-staged. Pre-commit roda `prettier --write` + `eslint --fix --max-warnings=0` em arquivos staged, depois `pnpm -r typecheck` no monorepo.

---

## 2. Output do critério de aceite

```bash
$ pnpm install
# Lock file already in sync, sem mudanças

$ docker compose up -d
Container rpx_expert_postgres  Healthy
Container rpx_expert_adminer   Started

$ pnpm --filter api prisma migrate dev
# já aplicada — schema in sync

$ pnpm --filter api db:seed
[seed] unidade já existente: RPX Expert — Matriz (cmpbsyelp00002malozscbq48)
[seed] admin já existe: admin@rpxexpert.local (cmpbsyent00022malwixy0uoi)

$ pnpm --filter api dev  # rodou em background nesta sessão
# API em http://localhost:3333

$ curl http://localhost:3333/health
{"status":"ok","db":"ok","timestamp":"2026-05-18T23:00:05.261Z"}
HTTP 200

$ curl -X POST http://localhost:3333/auth/login -d '{...credenciais...}'
{"accessToken":"eyJ...","refreshToken":"...","user":{"id":"...","email":"admin@rpxexpert.local","role":"ADMIN","unitId":"..."}}
HTTP 200

$ curl -H "Authorization: Bearer <token>" http://localhost:3333/units/me
{"id":"cmpbsyelp00002malozscbq48","name":"RPX Expert — Matriz","timezone":"America/Sao_Paulo",...}
HTTP 200

$ pnpm --filter api test
Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total

$ curl -o /dev/null -w "%{http_code}" http://localhost:3333/docs/
200 (Swagger UI carregando)
```

Endpoints registrados em `/docs-json`:

```
POST  /auth/login
POST  /auth/refresh
POST  /auth/logout
GET   /units/me
GET   /health
```

---

## 3. Decisões técnicas

| Decisão                        | Escolha                                                                                                                                       | Por quê                                                                                                                                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gestor de pacotes              | **pnpm 10**                                                                                                                                   | pedido no prompt, eficiente em monorepo                                                                                                                                                                         |
| Build runner                   | **Turborepo 2**                                                                                                                               | pedido no prompt, cache + grafo de dependências                                                                                                                                                                 |
| ID strategy                    | **cuid v1** (`@default(cuid())`)                                                                                                              | escolhido pelo Augusto na questão de aprovação — conflita com a sugestão do CLAUDE.md §7.1 (cuid2) mas seguimos o pedido literal do prompt da sessão. Marcado abaixo como ponto de divergência da constituição. |
| Cor primária                   | **`#00BCD4`**                                                                                                                                 | escolhido pelo Augusto — segue o valor já fixado no CLAUDE.md §1, mais claro que o ciano real do logo                                                                                                           |
| Container DI                   | NestJS padrão                                                                                                                                 | já é o stack                                                                                                                                                                                                    |
| Validação                      | **Zod** para env e DTOs (via `ZodValidationPipe`)                                                                                             | pedido no prompt; class-validator usado só em DTOs Swagger                                                                                                                                                      |
| Logger                         | **pino + nestjs-pino + pino-pretty**                                                                                                          | estruturado em prod, legível em dev                                                                                                                                                                             |
| Hash de senha                  | **argon2id**                                                                                                                                  | recomendação OWASP atual                                                                                                                                                                                        |
| Refresh token                  | random 48 bytes base64url + HMAC-SHA256 (segredo dedicado) no banco                                                                           | balanceia segurança e performance vs argon2 no path quente                                                                                                                                                      |
| Rotação de refresh             | atômica em `$transaction`, com detecção de reuso revogando toda a família do usuário                                                          | mitiga roubo de token                                                                                                                                                                                           |
| Porta da API                   | **3333** (default)                                                                                                                            | 3000 conflitou com Next.js de outro projeto rodando na máquina                                                                                                                                                  |
| Porta do Postgres no host      | **5433**                                                                                                                                      | 5432 ocupado pelo Postgres local Homebrew                                                                                                                                                                       |
| Module format do `@rpx/shared` | **CommonJS**                                                                                                                                  | máxima compatibilidade com Nest (CJS), Next, Expo, e ts-jest. ESM puro exigiria `.js` em imports e `dynamic import` no Nest.                                                                                    |
| Path alias `@rpx/shared`       | só em `tsconfig.json` (dev/test). Removido em `tsconfig.build.json` para o build resolver via `node_modules` → dist correto em `dist/main.js` | senão a rootDir do tsc se expande e o build vai para `dist/apps/api/src/main.js`                                                                                                                                |

---

## 4. Premissas assumidas (validar com Augusto)

> Marcadas em comentário ou aqui no relatório. Cada uma pode ser revisitada na próxima sessão.

1. **PREMISSA: validar com Augusto** — Decisão de `cuid v1` ao invés de `cuid2` cria conflito com a constituição (`CLAUDE.md §7.1`). Sugestão: ou atualizar o CLAUDE.md fixando `cuid v1` como o padrão, ou converter o schema para `cuid2` na próxima sessão (mudança rápida porque ainda não há dados em produção).
2. **PREMISSA: validar com Augusto** — `SEED_ADMIN_PASSWORD` default `RpxAdmin@2026` é frágil para qualquer ambiente além de dev local. Antes de qualquer deploy precisamos eliminar o fallback e exigir env explícita em `test`/`production`.
3. **PREMISSA: validar com Augusto** — `JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET` no `.env.example` têm valores marcados como "trocar em prod". Em produção, vamos exigir injeção via secret manager (AWS Secrets Manager / Doppler / 1Password CLI) — fora do escopo desta sessão.
4. **PREMISSA: validar com Augusto** — `Unit.name` não tem `@unique`, então a idempotência do seed casa por `(name, timezone)`. Se a clínica criar duas unidades com mesmo nome em fusos diferentes (improvável), o seed funcionará; se criar duas com mesmo nome no mesmo fuso (extremamente improvável), pegaria a primeira. Aceitável para seed; em produção a criação de Unit virá por endpoint admin.
5. **PREMISSA: validar com Augusto** — `UnitScopeInterceptor` apenas expõe `req.unitId` mas **não força filtro automático nas queries Prisma**. A constituição (§6) sugere considerar um Prisma middleware; foi deixado para fase futura, e cada service vai precisar lembrar de escopar manualmente. Alternativa: usar `Prisma.$extends` com `where: { unitId }` automático já na próxima sessão.
6. **PREMISSA: validar com Augusto** — Pre-commit roda `pnpm -r typecheck` no monorepo inteiro (não só nos arquivos staged). Mais lento mas mais seguro. Se incomodar, podemos restringir a workspaces tocados.
7. **PREMISSA: validar com Augusto** — `.claude/settings.json` foi commitado com as permissões usadas nesta sessão. `.claude/settings.local.json` está no gitignore. Se você preferir manter `settings.json` fora do controle de versão também, é só remover.

---

## 5. Pontos de conflito com CLAUDE.md

Único conflito formal: **ID strategy** (cuid v1 escolhido vs cuid2 sugerido na §7.1). Resolver na próxima sessão antes de criar entidades de domínio (que herdarão o padrão).

---

## 6. Próximos passos sugeridos (entrada da Fase 1)

A Fase 1 do roadmap (CLAUDE.md §10) é "Catálogo e cadastros". Sugestão de ordem:

1. **Decidir cuid v1 vs cuid2** (resolver §5 acima). Se trocar, criar migration de conversão.
2. **Módulo `services`** (catálogo): CRUD admin com `name`, `type`, `durationMinutes`, `slotCapacity`, `cancellationLeadMinutes`, `schedulingLeadMinutes`, `checkInWindowBeforeMin/After`, `acceptedPlanType`. Validações Zod compartilhadas no `@rpx/shared`.
3. **Módulo `equipments`**: CRUD admin com `name`, `totalQuantity` e a tabela `ServiceEquipment`.
4. **Módulo `professionals`**: registry (CREFITO/CREF) + N:N com Services. Criação dispara convite (pendente do módulo de notificações).
5. **Módulo `patients`**: cadastro pelo admin + convite via token de 7 dias (link de criação de senha). Stub do envio (email/WhatsApp) — implementação real fica para a Fase 7.
6. **Endpoint de criação de admins adicionais** (`POST /admin/users` exigindo role ADMIN).
7. **Setup do `apps/admin`** (Next.js + Shadcn) com tela de login, layout autenticado, e primeira listagem (Pacientes ou Serviços).
8. **Cobertura de testes**: regras de unicidade (email único, registry único), guardas de role nos endpoints novos.
9. **CI**: GitHub Actions com `pnpm install → typecheck → test → build`.

Bloqueios técnicos a resolver junto: secrets management (premissa 3), Prisma middleware de unit-scope (premissa 5).
