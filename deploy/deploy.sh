#!/usr/bin/env bash
#
# Deploy da API (apps/api) para o AWS Lightsail Container Service "rpx-api".
#
# Faz, em ordem:
#   1. (opcional) aplica migrations Prisma pendentes no banco de PRODUÇÃO
#   2. build da imagem Docker (linux/amd64 — o Lightsail roda x86)
#   3. push da imagem para o registro do Lightsail
#   4. atualiza a tag da imagem em deploy/containers.json
#   5. dispara o deployment e espera ficar ACTIVE
#
# Uso (a partir de qualquer pasta do repo):
#   ./deploy/deploy.sh              # deploy só do código (sem migrations)
#   ./deploy/deploy.sh --migrate    # roda `prisma migrate deploy` antes
#
# Pré-requisitos: docker, aws cli logado, pnpm. O deploy/containers.json
# (gitignored, com segredos) precisa existir — use deploy/containers.example.json
# como base.
set -euo pipefail

SERVICE="rpx-api"
LABEL="api"
# Raiz do repo = pasta-pai deste script.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CONTAINERS="deploy/containers.json"
ENDPOINT="deploy/endpoint.json"

if [[ ! -f "$CONTAINERS" ]]; then
  echo "✗ $CONTAINERS não encontrado (copie de deploy/containers.example.json e preencha)." >&2
  exit 1
fi

# 1. Migrations (opcional) ----------------------------------------------------
if [[ "${1:-}" == "--migrate" ]]; then
  echo "▶ Aplicando migrations no banco de produção (prisma migrate deploy)…"
  pnpm --filter @rpx/api exec prisma migrate deploy
  echo "✓ Migrations aplicadas."
fi

# 2. Build --------------------------------------------------------------------
echo "▶ Build da imagem (linux/amd64)…"
docker build --platform linux/amd64 -f apps/api/Dockerfile -t "$SERVICE:latest" .

# 3. Push ---------------------------------------------------------------------
echo "▶ Push para o Lightsail…"
PUSH_OUT="$(aws lightsail push-container-image --service-name "$SERVICE" --label "$LABEL" --image "$SERVICE:latest" 2>&1)"
echo "$PUSH_OUT"
IMG="$(echo "$PUSH_OUT" | grep -o ":$SERVICE.$LABEL.[0-9]*" | tail -1)"
if [[ -z "$IMG" ]]; then
  echo "✗ Não consegui extrair a referência da imagem do output do push." >&2
  exit 1
fi
echo "✓ Imagem registrada: $IMG"

# 4. Atualiza a tag em containers.json ---------------------------------------
python3 - "$CONTAINERS" "$IMG" <<'PY'
import json, sys
path, img = sys.argv[1], sys.argv[2]
d = json.load(open(path))
d["api"]["image"] = img
json.dump(d, open(path, "w"), indent=2)
print(f"✓ {path} -> {img}")
PY

# 5. Deploy + espera ----------------------------------------------------------
echo "▶ Disparando deployment…"
VER="$(aws lightsail create-container-service-deployment \
  --service-name "$SERVICE" \
  --containers "file://$CONTAINERS" \
  --public-endpoint "file://$ENDPOINT" \
  --query 'containerService.nextDeployment.version' --output text)"
echo "  versão $VER em deploy. Aguardando ficar ACTIVE…"

for i in $(seq 1 40); do
  STATE="$(aws lightsail get-container-service-deployments --service-name "$SERVICE" \
    --query 'deployments[0].state' --output text 2>/dev/null || echo '?')"
  case "$STATE" in
    ACTIVE)  echo "✓ Deploy v$VER ACTIVE — $IMG no ar."; exit 0 ;;
    FAILED)  echo "✗ Deploy v$VER FAILED. Veja os logs:"; \
             echo "  aws lightsail get-container-log --service-name $SERVICE --container-name api"; \
             exit 1 ;;
    *)       printf '  [%2d/40] estado=%s\n' "$i" "$STATE"; sleep 15 ;;
  esac
done
echo "✗ Timeout esperando ACTIVE (deploy pode ainda concluir; cheque o console)." >&2
exit 1
