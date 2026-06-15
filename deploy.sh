#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# ComboZap V2 — Deploy script para VPS Ubuntu/Debian
# Uso: bash deploy.sh
# ============================================================

REPO="https://github.com/volatusdev/combozapv2.git"
APP_DIR="/opt/combozap"
DOMAIN="combozap.com"
API_PORT=8080
WEB_PORT=3000

echo "======================================"
echo "  ComboZap V2 — Instalação completa"
echo "======================================"

# 1. Pacotes base
echo "[1/8] Instalando pacotes base..."
apt-get update -qq
apt-get install -y -qq git curl nginx certbot python3-certbot-nginx

# 2. Node.js 20 LTS
echo "[2/8] Instalando Node.js 20..."
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
node -v

# 3. pnpm + pm2
echo "[3/8] Instalando pnpm e pm2..."
npm install -g pnpm@latest pm2@latest --quiet

# 4. Remove versão antiga e clona combozapv2
echo "[4/8] Clonando combozapv2..."
pm2 delete all 2>/dev/null || true
rm -rf "$APP_DIR"
git clone "$REPO" "$APP_DIR"
cd "$APP_DIR"

# 5. Copia .env se existir backup, senão cria template
echo "[5/8] Configurando variáveis de ambiente..."
if [ -f /root/.combozap.env.bak ]; then
  cp /root/.combozap.env.bak "$APP_DIR/.env"
  echo "  .env restaurado do backup."
else
  cat > "$APP_DIR/.env" <<'ENV'
# Preencha antes de rodar!
NODE_ENV=production
PORT=8080
SESSION_SECRET=TROQUE_AQUI
NEON_URL_DATABASE=postgresql://...
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
EVO_KEY=
EVO_URL=
ENV
  echo ""
  echo "  ⚠️  ATENÇÃO: edite $APP_DIR/.env com suas variáveis antes de continuar!"
  echo "  Depois rode: pm2 restart all"
  echo ""
fi

# 6. Instala deps e faz build
echo "[6/8] Instalando dependências e fazendo build..."
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/web run build

# 7. Sobe com pm2
echo "[7/8] Iniciando serviços com pm2..."
cd "$APP_DIR"
pm2 start artifacts/api-server/dist/index.js \
  --name combozap-api \
  --env production \
  --update-env

pm2 serve artifacts/web/dist "$WEB_PORT" \
  --name combozap-web \
  --spa

pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash || true

# 8. Nginx
echo "[8/8] Configurando Nginx..."
cat > /etc/nginx/sites-available/combozap <<NGINX
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:$WEB_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    # API
    location /api {
        proxy_pass http://127.0.0.1:$API_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
    }

    # WebSocket (signaling de chamadas)
    location /ws {
        proxy_pass http://127.0.0.1:$API_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 86400;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/combozap /etc/nginx/sites-enabled/combozap
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo ""
echo "======================================"
echo "  ✓ Deploy concluído!"
echo "======================================"
echo "  Frontend : http://$DOMAIN"
echo "  API      : http://$DOMAIN/api"
echo "  Status   : pm2 status"
echo ""
echo "  Para HTTPS rode:"
echo "  certbot --nginx -d $DOMAIN -d www.$DOMAIN"
echo ""
