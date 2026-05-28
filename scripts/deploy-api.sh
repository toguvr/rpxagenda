#!/usr/bin/env bash
#
# Deploy da API (apps/api) para o AWS Lightsail Container Service.
#
# Fluxo:
#   1. Checa migrations pendentes na prod (prisma migrate status).
#      - Por segurança, NÃO aplica nada sozinho. Se houver pendência, aborta e
#        pede para rodar com --migrate (que roda `prisma migrate deploy` antes
#        de subir o código novo — garante que a coluna/tabela exista antes).
#   2. docker build (linux/amd64) da imagem.
#   3. push para o registry do Lightsail e captura a nova referência (:rpx-api.api.N).
#   4. cria o deployment reaproveitando deploy/containers.json (env/segredos) e
#      deploy/endpoint.json, trocando só a imagem.
#   5. aguarda ficar RUNNING na nova versão e faz um smoke test.
#
# Uso:
#   ./scripts/deploy-api.sh            # build + push + deploy (aborta se houver migration pendente)
#   ./scripts/deploy-api.sh --migrate  # idem, mas aplica migrations pendentes na prod antes
#
# Pré-requisitos: docker rodando, AWS CLI configurado, jq, pnpm.
# Config sensível: deploy/containers.json (fora do git). Use deploy/containers.example.json
# como modelo. Os segredos do banco vêm de apps/api/.env (para o migrate status/deploy).

set -euo pipefail

REGION="${RPX_AWS_REGION:-us-east-1}"
SERVICE="${RPX_SERVICE_NAME:-rpx-api}"
LABEL="${RPX_IMAGE_LABEL:-api}"
IMAGE_TAG="${RPX_IMAGE_TAG:-rpx-api:latest}"
PUBLIC_URL="${RPX_PUBLIC_URL:-https://rpxagenda.togu.dev}"
POLL_TRIES="${RPX_POLL_TRIES:-30}"
POLL_INTERVAL="${RPX_POLL_INTERVAL:-20}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$ROOT/deploy"
CONTAINERS="$DEPLOY_DIR/containers.json"
ENDPOINT="$DEPLOY_DIR/endpoint.json"
API_DIR="$ROOT/apps/api"
DOCKERFILE="$API_DIR/Dockerfile"

RUN_MIGRATE=0
for arg in "$@"; do
  case "$arg" in
    --migrate) RUN_MIGRATE=1 ;;
    -h | --help)
      awk 'NR==1 {next} /^#/ {sub(/^# ?/, ""); print; next} {exit}' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      echo "Argumento desconhecido: $arg" >&2
      exit 1
      ;;
  esac
done

die() {
  echo "ERRO: $*" >&2
  exit 1
}
step() { echo "==> $*"; }

# ---------- pré-requisitos ----------
command -v docker >/dev/null 2>&1 || die "docker não encontrado."
docker info >/dev/null 2>&1 || die "Docker não está rodando."
command -v aws >/dev/null 2>&1 || die "AWS CLI não encontrado."
command -v jq >/dev/null 2>&1 || die "jq não encontrado (brew install jq)."
command -v pnpm >/dev/null 2>&1 || die "pnpm não encontrado."
[ -f "$CONTAINERS" ] || die "Falta $CONTAINERS — copie de deploy/containers.example.json e preencha os segredos."
[ -f "$ENDPOINT" ] || die "Falta $ENDPOINT."

# ---------- 1. migrations ----------
step "Checando migrations pendentes na prod…"
cd "$API_DIR"
set +e
STATUS_OUT="$(pnpm exec prisma migrate status 2>&1)"
set -e
if echo "$STATUS_OUT" | grep -q "have not yet been applied"; then
  echo "$STATUS_OUT" | sed -n '/have not yet been applied/,$p'
  if [ "$RUN_MIGRATE" -eq 1 ]; then
    step "Aplicando migrations (prisma migrate deploy)…"
    pnpm exec prisma migrate deploy
  else
    die "Há migrations pendentes. Revise e rode novamente com --migrate para aplicá-las antes do deploy."
  fi
elif echo "$STATUS_OUT" | grep -qiE "up to date"; then
  echo "Nenhuma migration pendente."
else
  echo "$STATUS_OUT"
  die "Não foi possível determinar o status das migrations (erro de conexão com o banco?)."
fi
cd "$ROOT"

# ---------- 2. build ----------
step "Build da imagem (linux/amd64)…"
docker build --platform linux/amd64 -f "$DOCKERFILE" -t "$IMAGE_TAG" "$ROOT"

# ---------- 3. push ----------
step "Enviando a imagem para o Lightsail…"
PUSH_OUT="$(aws lightsail push-container-image \
  --region "$REGION" --service-name "$SERVICE" --label "$LABEL" --image "$IMAGE_TAG")"
echo "$PUSH_OUT"
IMAGE_REF="$(echo "$PUSH_OUT" | grep -oE ":${SERVICE}\.${LABEL}\.[0-9]+" | tail -1)"
[ -n "$IMAGE_REF" ] || die "Não consegui extrair a referência da imagem do output do push."
step "Imagem registrada: $IMAGE_REF"

# ---------- 4. deployment ----------
TMP_CONTAINERS="$(mktemp)"
trap 'rm -f "$TMP_CONTAINERS"' EXIT
jq --arg img "$IMAGE_REF" '.api.image = $img' "$CONTAINERS" >"$TMP_CONTAINERS"

step "Criando deployment…"
NEXT_VERSION="$(aws lightsail create-container-service-deployment \
  --region "$REGION" --service-name "$SERVICE" \
  --containers "file://$TMP_CONTAINERS" \
  --public-endpoint "file://$ENDPOINT" \
  --query 'containerService.nextDeployment.version' --output text)"
[ -n "$NEXT_VERSION" ] && [ "$NEXT_VERSION" != "None" ] || die "Falha ao criar o deployment."
step "Deployment v$NEXT_VERSION iniciado. Aguardando ficar RUNNING…"

# ---------- 5. poll ----------
DONE=0
for i in $(seq 1 "$POLL_TRIES"); do
  read -r STATE CURVER NEXTSTATE <<<"$(aws lightsail get-container-services \
    --region "$REGION" --service-name "$SERVICE" \
    --query 'containerServices[0].[state,currentDeployment.version,nextDeployment.state]' \
    --output text)"
  echo "  [$i/$POLL_TRIES] state=$STATE current=v$CURVER next=$NEXTSTATE"
  if [ "$STATE" = "RUNNING" ] && [ "$CURVER" = "$NEXT_VERSION" ]; then
    DONE=1
    break
  fi
  if [ "$NEXTSTATE" = "FAILED" ]; then
    die "Deployment v$NEXT_VERSION FALHOU. Veja os logs: aws lightsail get-container-log --region $REGION --service-name $SERVICE --container-name api"
  fi
  sleep "$POLL_INTERVAL"
done
[ "$DONE" -eq 1 ] || die "Timeout aguardando o deployment v$NEXT_VERSION ficar RUNNING."

# ---------- 6. smoke test ----------
step "Smoke test…"
CODE="$(curl -s -o /dev/null -w '%{http_code}' "$PUBLIC_URL/" || echo "000")"
echo "  GET $PUBLIC_URL/ -> $CODE"
step "Deploy concluído ✓  ($SERVICE v$NEXT_VERSION em $PUBLIC_URL)"
