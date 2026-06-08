# Sessão 15 — iDFace Push: por que o cadastro de rosto não chegava ao totem

Data: 2026-06-08
Branch: `master`
Escopo: investigar e corrigir "o cadastro biométrico (foto → totem) não está criando o rosto na máquina". Acabou revelando **três** bugs encadeados (um deles travava o boot da API inteira em produção).

---

## 1. Sintoma

Admin salva a foto do paciente → o enrollment e o comando `CREATE_USER` são criados no banco, mas o totem **nunca cadastra o rosto**. No banco de produção: device `4408801109440198` ativo, `lastSeenAt: null`, e todos os comandos presos em `PENDING` com `attempts: 0`.

## 2. Causa raiz (3 bugs)

### Bug 1 — Guard bloqueava todo poll do device (HTTP 401)

O protocolo **Push** da ControliD ([doc](https://www.controlid.com.br/docs/access-api-en/push-mode/introduction-to-push/)) tem `push_remote_address` = **host:porta apenas** — o device chama `GET /push?deviceId=&uuid=` e `POST /result?deviceId=` na **raiz** e **não consegue enviar header custom nem query `?secret=`**. O `IdfaceWebhookGuard` então respondia **401 em todo poll**. Por isso `lastSeenAt` nunca atualizava e nenhum comando saía de `PENDING`.

**Fix:** removido o guard de `/push` e `/result` (raiz e `/webhooks/idface`). Autenticação passa a ser o próprio `deviceId` (device desconhecido/inativo → fila vazia). `/access-event` **mantém** o guard (aquele usa o modo "monitor", que suporta header). Documentado como `PREMISSA`.

### Bug 2 — Correlação de `uuid` invertida

No protocolo, **o device** gera o `uuid` no `GET /push?uuid=` e devolve o mesmo no `POST /result`. O código gerava um `uuid` interno e procurava por ele → todo `/result` cairia em "uuid desconhecido" e o enrollment nunca avançaria de `CREATE_USER → SET_IMAGE`.

**Fix:** novo campo `IdfaceCommand.dispatchUuid` grava o uuid do device no dispatch; `recordResult` correlaciona por ele. Migration aditiva `20260605180000_idface_command_dispatch_uuid` (coluna nullable + índice). Também `match: 0` no `user_set_image_list` (recomendação ControliD p/ cadastro).

### Bug 3 (o que travava tudo) — DI quebrava o boot da API

`IdfacePushRootController` injeta `IdfacePushController`, mas o controller estava só em `controllers`, não em `providers`. Nest não resolvia a dependência e a aplicação **falhava no bootstrap** ("can't resolve dependencies of IdfacePushRootController"). Presente desde `ad829f4` (introdução do root controller): **todo deploy desse código falhava o health check do Lightsail e era revertido para a imagem anterior** — por isso o modo Push nunca chegou a rodar em produção.

**Fix:** `IdfacePushController` adicionado a `providers` (Nest aceita a mesma classe como controller + provider). Boot validado localmente: "Nest application successfully started" + `GET /push` → 200.

## 3. Estado após a sessão

- **Backend: corrigido e no ar.** Deploy v16 (`:rpx-api.api.46`) ACTIVE no Lightsail `rpx-api`. Migration aplicada em produção. Rotas `/push`, `/result` mapeadas. `/push` retorna 200 (sem 401).
- **4 comandos `CREATE_USER` PENDING** aguardando o device (enrollments user 1000–1003).
- **O totem NÃO está pollando a produção.** `lastSeenAt` continua congelado no `curl` de teste desta sessão (16:05:55Z) e nenhum comando saiu de `PENDING`. Nos logs há só os mapeamentos de rota no boot — zero requisições `/push` do device.

## 4. Bloqueio remanescente (lado do equipamento — não é código)

O totem precisa ser configurado para o **modo Push** (diferente do "monitor/notificação" que alimenta o `access-event`):

1. Habilitar **Push** no equipamento.
2. `push_remote_address` apontando para a produção: host `rpx-api.ntrkkt6gbxg7t.us-east-1.cs.amazonlightsail.com`, porta `443`.
3. **Caveat HTTPS:** o Lightsail só serve **HTTPS (443)**. O `access-event` já chega via HTTPS, então o equipamento fala TLS — mas confirmar com a ControliD se o **cliente Push** do firmware faz HTTPS no `push_remote_address` (a doc lista o param como host:porta; firmwares variam). Se o Push só fizer HTTP puro, será preciso um proxy/porta HTTP na frente.

### Como confirmar que destravou

Assim que o Push estiver apontando para a produção:

- `IdfaceDevice.lastSeenAt` passa a **avançar sozinho** (a cada `push_request_period`).
- Os 4 comandos `PENDING` viram `DISPATCHED → DONE` em sequência.
- `IdfaceEnrollment` vira `REGISTERED` e `Patient.idfaceUserId` é preenchido.

## 5. Commits

- `fix(idface): destravar Push — remover guard do device e corrigir correlação de uuid`
- `fix(idface): registrar IdfacePushController como provider (boot quebrava)`

(`deploy/containers.json` é gitignored — a tag da imagem foi bumpada localmente para `:rpx-api.api.46`.)
