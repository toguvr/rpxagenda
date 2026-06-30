# Sessão — Convite de profissional + permissões por tela

> Data: 2026-06-16

## Objetivo

Ao **convidar um profissional**, escolher **quais telas do painel admin** ele pode acessar.
O profissional faz login no painel admin (web) com seu próprio e-mail/senha.

## Decisões (confirmadas com o stakeholder)

1. **Convite por token** (igual a paciente): admin cadastra → e-mail com link → profissional
   define a própria senha. Não se define senha pelo admin.
2. **Enforcement front + back**: o admin esconde/bloqueia telas e o backend valida via guard.
3. **Qualquer tela é concedível**, inclusive Financeiro e iDFace (antes exclusivas de ADMIN).

## O que foi feito

### `packages/shared`

- Novo `screens.ts`: `ScreenKey`, `SCREENS` (key/label/path + `dependsOn`), `ALL_SCREEN_KEYS`,
  `screenForPath()`, `effectiveScreens(role, allowedScreens)`. Fonte única de telas.
- `authenticatedUserSchema` ganhou `permissions: string[]`.
- `professional.ts`: `create` agora usa `email` + `allowedScreens` (sem `password`); `update`
  aceita `allowedScreens`; `ProfessionalResponse` ganhou `allowedScreens`, `hasAccess`, `userId`
  nullable. Novos schemas de convite (`ProfessionalInvite*`, `RedeemProfessionalInvite*`).

### `apps/api`

- **Prisma**: `Professional.userId` nullable (onDelete `SetNull`), novos `email` e
  `allowedScreens String[]`; novo model `ProfessionalInvite` (espelha `PatientInvite`).
  Migration `20260615120000_professional_invites_and_screens` escrita à mão (aditiva), com
  **backfill**: copia o e-mail da conta existente e concede **todas as telas** aos profissionais
  já cadastrados (preserva o comportamento atual).
- **Auth**: `JwtAccessPayload`/`RequestUser` ganharam `permissions`. `issueTokens` computa as
  permissões (ADMIN = todas; PROFESSIONAL = `allowedScreens`; PATIENT = vazio) e as coloca no
  JWT e no `user` da resposta. `jwt.strategy` propaga `payload.permissions` para `req.user`.
- **`@Screen(ScreenKey)` + `ScreensGuard`** (APP_GUARD após `RolesGuard`): ADMIN passa sempre;
  PROFESSIONAL só passa se a tela estiver em `permissions`; `@Public` e PATIENT não são afetados.
  Aplicado nos controllers de cada tela (dashboard, appointments, patients, plans, finance,
  services, schedules, equipments, professionals, idface-devices).
- **`ProfessionalsService`**: `create` cadastra sem conta de acesso e dispara convite por e-mail;
  novos `generateInvite`, `lookupInvite`, `redeemInvite` (cria User PROFESSIONAL + autentica).
  Controller com `POST /professionals/:id/invites` (admin) e os públicos
  `GET|POST /professional-invites/:token[/redeem]`.

### `apps/admin`

- `ProfessionalForm`: e-mail (em vez de senha) + seleção de **telas** (com aviso de dependências
  e de "nenhuma tela = não vê nada").
- Página de edição com painel **Acesso ao painel** (status pendente/ativo, gerar/copiar link).
- Nova página pública `professional-invites/[token]/redeem` (define senha e entra no painel).
- Lista de profissionais com coluna **Acesso** (Convite pendente / Acesso ativo).
- Layout autenticado: menu e **guarda de rota** derivados de `permissions` (não mais `adminOnly`).
- Login/redeem mandam o profissional para a **primeira tela liberada**.

## Premissas assumidas

- Permissões viajam no JWT (TTL ≤15min). Mudar telas concedidas vale na próxima renovação do
  access token — sem revogação imediata. Coerente com o tratamento de `role`.
- Profissionais já logados no deploy podem ficar ≤15min sem telas até o refresh (o backfill já os
  deixa com todas). ADMIN não é afetado (front usa o `role`, back faz bypass por `role`).
- Telas com dependência (Agenda/Planos consultam Pacientes e Serviços) NÃO são concedidas
  automaticamente — o admin precisa marcar as telas dependentes. O form avisa.

## Pendências / próximos passos

- **Aplicar a migration no banco** (o `DATABASE_URL` atual aponta para PRODUÇÃO — não rodei
  `prisma migrate`). Rodar `prisma migrate deploy` num ambiente controlado.
- 3 suites de teste de integração (`patients.invite.spec`, `medical-records.integration.spec`,
  `idface.integration.spec`) **já falhavam antes** desta sessão por arity desatualizada no
  construtor mockado de `PatientsService` — não relacionadas a esta mudança.
