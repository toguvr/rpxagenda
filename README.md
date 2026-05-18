# RPX Expert

Sistema de agendamento e gestão clínica para a **RPX Expert** — clínica de saúde da coluna combinando fisioterapia, RPG, pilates e musculação terapêutica.

> 📜 A constituição técnica/produto do projeto está em [CLAUDE.md](CLAUDE.md). Toda decisão deve ser consistente com ela.

## Identidade visual

| Token            | Hex       | Uso                         |
| ---------------- | --------- | --------------------------- |
| `brand.black`    | `#000000` | Texto, marca, contraste     |
| `brand.cyan`     | `#00BCD4` | Cor primária (acentos, CTA) |
| `brand.bgLight`  | `#FFFFFF` | Fundo claro                 |
| `brand.bgDark`   | `#0A0A0A` | Fundo escuro                |

Cores derivadas do logo (preto + ciano). Definidas como tokens em [`packages/shared/src/design-tokens.ts`](packages/shared/src/design-tokens.ts) para reuso futuro no mobile e no admin.

## Estrutura do monorepo

```
rpx-expert/
├── apps/
│   ├── api/        # NestJS + Prisma + Postgres
│   ├── mobile/     # Expo (placeholder)
│   └── admin/      # Next.js (placeholder)
├── packages/
│   └── shared/     # tipos, enums, schemas Zod, design tokens
├── docker-compose.yml
└── turbo.json
```

Gestão por **pnpm workspaces** + **Turborepo**.

## Pré-requisitos

- Node **20.18.0** (use `nvm use`)
- pnpm **10+**
- Docker + Docker Compose

## Setup do zero

```bash
# 1. Instalar dependências
pnpm install

# 2. Subir Postgres (porta 5433 — 5432 fica para o Postgres local) e Adminer (porta 8080)
docker compose up -d

# 3. Configurar variáveis da API
cp apps/api/.env.example apps/api/.env

# 4. Aplicar migrations
pnpm --filter api prisma migrate dev

# 5. Popular dados iniciais (1 unidade + 1 admin)
pnpm --filter api db:seed

# 6. Subir a API em dev (http://localhost:3000)
pnpm --filter api dev
```

Após subir:

- `GET http://localhost:3000/health` → status do sistema e do banco.
- `POST http://localhost:3000/auth/login` → autentica com o admin do seed.
- `http://localhost:3000/docs` → Swagger UI (apenas em dev).
- `http://localhost:8080` → Adminer (Postgres: server `postgres`, user `rpx`, pwd `rpx`, db `rpx_expert`).

## Variáveis de ambiente da API

Ver [`apps/api/.env.example`](apps/api/.env.example). Resumo:

| Variável                | Default                                                | Descrição                       |
| ----------------------- | ------------------------------------------------------ | ------------------------------- |
| `NODE_ENV`              | `development`                                          | Ambiente                        |
| `PORT`                  | `3000`                                                 | Porta HTTP                      |
| `DATABASE_URL`          | `postgresql://rpx:rpx@localhost:5433/rpx_expert`       | Postgres                        |
| `JWT_ACCESS_SECRET`     | —                                                      | Segredo do access token (≥32)   |
| `JWT_REFRESH_SECRET`    | —                                                      | Segredo do refresh token (≥32)  |
| `JWT_ACCESS_TTL`        | `15m`                                                  | TTL do access                   |
| `JWT_REFRESH_TTL_DAYS`  | `30`                                                   | TTL do refresh em dias          |
| `SEED_ADMIN_EMAIL`      | `admin@rpxexpert.local`                                | Admin do seed                   |
| `SEED_ADMIN_PASSWORD`   | `RpxAdmin@2026`                                        | Senha do admin do seed          |
| `SEED_UNIT_NAME`        | `RPX Expert — Matriz`                                  | Nome da unidade do seed         |
| `LOG_LEVEL`             | `info`                                                 | Nível do logger pino            |

## Scripts úteis (raiz)

```bash
pnpm build         # build em todos os pacotes
pnpm dev           # dev em paralelo
pnpm lint          # lint
pnpm typecheck     # typecheck
pnpm test          # testes
pnpm format        # prettier --write
```

## Roadmap

Esta sessão entregou a **Fase 0** (bootstrap). Próximas fases descritas em [`CLAUDE.md`](CLAUDE.md#10-roadmap-de-implementação-alto-nível).
