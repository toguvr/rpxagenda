# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:22-bookworm-slim

# Base: pnpm via corepack + OpenSSL para o Prisma
FROM ${NODE_IMAGE} AS base
WORKDIR /repo
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

# Builder: instala tudo, gera Prisma Client, builda shared + api e empacota com pnpm deploy
FROM base AS builder
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY apps/api apps/api
# Build shared com --build --force para garantir emit de .d.ts em modo composite
# (tsc -p tsconfig.json com composite tem um quirk que pula o emit dos .d.ts)
RUN cd packages/shared && /repo/node_modules/.bin/tsc --build --force tsconfig.json \
 && pnpm --filter @rpx/api exec prisma generate \
 && pnpm --filter @rpx/api build \
 && pnpm deploy --filter @rpx/api --prod --legacy /deploy \
 && cd /deploy && /repo/apps/api/node_modules/.bin/prisma generate --schema=prisma/schema.prisma

# Runtime: imagem enxuta com OpenSSL + tini para sinais
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PORT=3333
COPY --from=builder /deploy /app
EXPOSE 3333
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
