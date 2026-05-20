# Sessão 13 — Mobile: bootstrap do app do paciente (Expo)

Data: 2026-05-20
Branch: `main`
Escopo: tirar `apps/mobile` do estado de placeholder e colocar o app do paciente de pé — Expo SDK 52 + Expo Router + NativeWind, com login real contra a API, sessão persistida e duas telas autenticadas (Agenda e Planos) consumindo endpoints `/me/*` que já existiam no backend.

---

## 1. Entregue

### 1.1 Configuração do projeto Expo

- **`package.json`** — saiu de placeholder para um app real: `expo ~52`, `expo-router ~4`, `react 18.3.1` / `react-native 0.76.5`, `nativewind 4.1.23`, `@tanstack/react-query`, `expo-secure-store`. `main: "expo-router/entry"`.
- **`app.json`** — nome "RPX Expert", scheme `rpxexpert`, `newArchEnabled`, plugins `expo-router` + `expo-secure-store`, `web.output: "single"`, `typedRoutes`.
- **`babel.config.js`** — `babel-preset-expo` com `jsxImportSource: 'nativewind'` + preset `nativewind/babel`. `reanimated: false` (o app não usa Reanimated; sem isso o preset injeta o plugin de worklets e quebra o bundle).
- **`metro.config.js`** — Metro ciente do monorepo: `watchFolders` na raiz, `nodeModulesPaths` do app + raiz, embrulhado com `withNativeWind`.
- **`tailwind.config.js` + `global.css`** — NativeWind preset + cores da marca (`brand.cyan #00BCD4`, `cyanDark`, `cyanLight`, `bgDark`).
- **`tsconfig.json`** — `expo/tsconfig.base`, strict, alias `@/* → src/*`.

### 1.2 Camada de auth e API

- **`src/lib/auth.ts`** — wrappers sobre `expo-secure-store`: `saveSession` / `getAccessToken` / `getRefreshToken` / `getCurrentUser` / `clearSession` (tudo assíncrono — SecureStore é async no device).
- **`src/lib/api.ts`** — fetch wrapper: injeta `Bearer`, faz **refresh automático em 401** (uma vez, via `/auth/refresh`), devolve `ApiError` tipada. `setSessionExpiredHandler` deixa a UI reagir quando o refresh falha. Helpers `login()` e `logoutApi()`.

### 1.3 Telas

- **`app/_layout.tsx`** — root: `QueryClientProvider` + `SafeAreaProvider` + `Stack`. Importa o `global.css`.
- **`app/index.tsx`** — redireciona para `/(tabs)/agenda` ou `/login` conforme houver token.
- **`app/login.tsx`** — tela de login (fundo escuro, marca ciano), e-mail + senha, trata erro da API.
- **`app/(tabs)/_layout.tsx`** — `Tabs` com guarda de auth (`Redirect` se sem token) e registro do `setSessionExpiredHandler`.
- **`app/(tabs)/agenda.tsx`** — `useQuery(['me','appointments'])` → `GET /me/appointments`, lista ordenada por data com badge de status; botão Sair.
- **`app/(tabs)/planos.tsx`** — `useQuery(['me','plans'])` → `GET /me/plans`, card por plano com saldo de sessões (PACKAGE) ou quota semanal (SUBSCRIPTION).

Ambas as telas batem em endpoints **que já existiam** (`plans.controller.ts:56`, `appointments.controller.ts:85`) — nenhuma mudança de backend nesta sessão.

---

## 2. Briga com dependências (o trabalho real da sessão)

O bootstrap em si é rápido; o custo foi alinhar Expo + NativeWind + Reanimated dentro do pnpm. Sequência de problemas resolvidos:

| Problema                                                                       | Causa                                                                                                         | Correção                                                                                              |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Typecheck do mobile acusava `Stack`/`Tabs` "cannot be used as a JSX component" | `@types/react@19` vazando para o app (React 18)                                                               | `pnpm.overrides` na raiz: `@types/react ~18.3.12`, `@types/react-dom ~18.3.1`                         |
| `react-native-reanimated@4` — peer não satisfeito (exige RN 0.81+)             | Resolução pegava a major nova                                                                                 | Pin em `3.16.7` no app + `pnpm.overrides`                                                             |
| `expo export` falhava: `Cannot find module 'react-native-worklets/plugin'`     | `react-native-css-interop@0.2.4` (puxado por `nativewind@4.2.4`) hardcoda `react-native-worklets/plugin`      | Pin `nativewind` em **`4.1.23` exato** (usa css-interop `0.1.22`, que referencia `reanimated/plugin`) |
| `Unable to resolve module @expo/metro-runtime`                                 | `metro.config.js` tinha `disableHierarchicalLookup = true` — impedia o Metro de subir até o pacote no `.pnpm` | Removida a linha; lookup hierárquico é necessário para a árvore aninhada do pnpm                      |
| `Unable to resolve module @babel/runtime/helpers/...`                          | `@babel/runtime` (helpers que o babel emite) não era resolvível a partir dos fontes do app                    | Adicionado `@babel/runtime` como dependência direta do mobile                                         |
| `Unable to resolve module react-native-css-interop/jsx-runtime`                | O JSX runtime do NativeWind é dep transitiva aninhada — invisível para os fontes do app                       | Adicionado `react-native-css-interop@0.1.22` como dependência direta do mobile                        |

**Lição para o monorepo:** com pnpm, todo pacote referenciado **diretamente no código transpilado dos nossos fontes** (helpers do babel, JSX runtime do NativeWind) precisa ser dependência direta do app — não basta ser transitivo. E `disableHierarchicalLookup` (recomendado em guias de monorepo yarn/npm) **quebra** com a estrutura aninhada do pnpm.

---

## 3. Critérios de aceite

```
pnpm install                                  → ok (1529 pacotes)
pnpm --filter @rpx/mobile exec tsc --noEmit   → EXIT 0
pnpm --filter @rpx/mobile exec expo export --platform web
  → Web Bundled (701 modules)
  → entry-*.js 1.04 MB  |  web-*.css 9.61 kB
  → Exported: dist
```

Bundle web gera limpo. O export web é o smoke test possível sem device/emulador — confirma que Metro, babel, NativeWind e o grafo de módulos resolvem ponta a ponta.

---

## 4. Decisões técnicas

| Decisão                               | Escolha                               | Por quê                                                                                          |
| ------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `nativewind` pinado em `4.1.23` exato | Não usar `^` nem `4.2.x`              | A 4.2.4 puxa css-interop 0.2.4, que exige `react-native-worklets` e quebra o bundle.             |
| `reanimated: false` no babel-preset   | Desligar worklets                     | O app não usa Reanimated; o plugin de worklets só atrapalha.                                     |
| `expo-secure-store` para tokens       | Conforme CLAUDE.md §7.3               | Tokens não vão para AsyncStorage; SecureStore usa Keychain/Keystore.                             |
| Refresh automático no `api()`         | Retry único em 401                    | Access token vive 15min; o refresh transparente evita logout a cada expiração.                   |
| React Query para estado servidor      | Conforme CLAUDE.md §7.3               | Cache, loading/error e revalidação prontos; sem Zustand ainda (sem estado client global).        |
| Telas só de leitura nesta sessão      | Agenda + Planos, sem agendar/cancelar | Bootstrap valida o caminho auth→API→UI. Fluxos de escrita ficam para a próxima sessão de mobile. |

---

## 5. Premissas em aberto

> Adições às já vigentes (Sessões 01-12).

1. **PREMISSA**: O app ainda **não tem fluxo de agendar/cancelar sessão** nem tela de prontuário/protocolo — só leitura de Agenda e Planos. O backend já expõe os endpoints; falta a UI mobile.
2. **PREMISSA**: O **deep link do convite** (paciente cria senha via token de 7 dias — CLAUDE.md §6) não está implementado no app. O scheme `rpxexpert` está registrado, mas não há rota de onboarding.
3. **PREMISSA**: **Push notifications** (registrar Expo push token no login — CLAUDE.md §7.3) ainda não foram ligadas. Entram junto com a Fase 7.
4. **PREMISSA**: O bundle foi validado só via `expo export --platform web`. Não houve build/run em emulador iOS/Android nesta sessão.
5. **PREMISSA**: `EXPO_PUBLIC_API_URL` aponta para `http://localhost:3333`. Em device físico isso precisa virar o IP da máquina na LAN (ou um túnel) — configurável via `.env`.

---

## 6. Stats da sessão

| Métrica                | Antes       | Depois                                   |
| ---------------------- | ----------- | ---------------------------------------- |
| `apps/mobile`          | placeholder | **app Expo funcional** (login + 2 telas) |
| Telas mobile           | 0           | **4** (index, login, agenda, planos)     |
| Apps do monorepo de pé | api + admin | **api + admin + mobile**                 |

Commits: 1 (Sessão 13) + 1 (SESSION-13-REPORT).

---

## 7. Próximos passos sugeridos

**Mobile — completar o app do paciente:**

1. Fluxo de **agendar sessão** (escolher serviço → slot disponível → equipamentos → confirmar).
2. **Cancelar** agendamento (respeitando `cancellationLeadMinutes`).
3. Tela de **onboarding via convite** (deep link `rpxexpert://`, criar senha).
4. **Push token** no login (prepara a Fase 7).
5. Build em emulador/device para validar fora do export web.

**Backend — fases restantes do roadmap:**

- Fase 6 (Pagar.me) — cobrança de PACKAGE + assinatura de SUBSCRIPTION.
- Fase 7 (Notificações) — Expo Push + WhatsApp; envio automático do convite.
- Fase 8 (Hardening) — CI (GitHub Actions), observabilidade, rate limiting.

Recomendação: com api + admin + mobile de pé, o caminho mais valioso é **fechar o loop do paciente no mobile** (agendar/cancelar) — hoje o paciente só consulta, quem agenda é a recepção pelo admin. Alternativamente, Fase 6/7, que dependem de contas/decisões com a clínica.
