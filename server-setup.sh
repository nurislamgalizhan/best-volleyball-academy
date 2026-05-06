#!/bin/bash
# ================================================================
# Mercury Medet CRM — Полный деплой на сервер
# Запускать от root: bash server-setup.sh
# ================================================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
info() { echo -e "${BLUE}[→]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo -e "${BLUE}"
echo "================================================"
echo "   Mercury Medet CRM — Server Deploy"
echo "================================================"
echo -e "${NC}"

# ── 1. Root check ──────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  err "Запускай от root: sudo bash server-setup.sh"
fi

SERVER_IP=$(curl -s --max-time 5 ifconfig.me || hostname -I | awk '{print $1}')
log "IP сервера: $SERVER_IP"

# ── 2. Обновление системы ──────────────────────────
info "Обновление системы..."
apt-get update -qq
apt-get install -y -qq curl git openssl ufw certbot 2>/dev/null || apt-get install -y -qq curl git openssl ufw

# ── 3. Docker ──────────────────────────────────────
if ! command -v docker &>/dev/null; then
  info "Установка Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  log "Docker установлен"
else
  log "Docker уже установлен: $(docker --version)"
fi

# ── 4. Клонирование репозитория ────────────────────
DEPLOY_DIR="/opt/mercury-medet"
if [ -d "$DEPLOY_DIR/.git" ]; then
  info "Обновление кода..."
  cd "$DEPLOY_DIR"
  git fetch origin
  git reset --hard origin/main
else
  info "Клонирование репозитория..."
  rm -rf "$DEPLOY_DIR"
  git clone https://github.com/nurislamgalizhan/mercury-medet.git "$DEPLOY_DIR"
  cd "$DEPLOY_DIR"
fi
log "Код готов в $DEPLOY_DIR"

# ── 5. Генерация .env ──────────────────────────────
if [ ! -f "$DEPLOY_DIR/.env" ]; then
  info "Создание .env..."
  JWT=$(openssl rand -hex 32)
  DBP=$(openssl rand -hex 16)
  cat > "$DEPLOY_DIR/.env" <<EOF
DB_USER=mercury
DB_PASSWORD=${DBP}
DB_NAME=mercury_medet

JWT_SECRET=${JWT}
JWT_EXPIRES_IN=7d
FRONTEND_URL=https://${SERVER_IP}

ADMIN_PHONE=77700000000
ADMIN_PASSWORD=Admin2024!
ADMIN_FIRST_NAME=Администратор
ADMIN_LAST_NAME=Системы

GREEN_API_URL=
GREEN_API_ID_INSTANCE=
GREEN_API_TOKEN_INSTANCE=

APP_PORT=80
EOF
  log ".env создан"
else
  log ".env уже существует — не перезаписываю"
fi

# ── 6. SSL сертификат (self-signed для IP) ─────────
SSL_DIR="/opt/mercury-medet/ssl"
mkdir -p "$SSL_DIR"
if [ ! -f "$SSL_DIR/cert.pem" ]; then
  info "Генерация SSL сертификата..."
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "$SSL_DIR/key.pem" \
    -out "$SSL_DIR/cert.pem" \
    -subj "/C=KZ/ST=Almaty/L=Almaty/O=MercuryMedet/CN=${SERVER_IP}" \
    -addext "subjectAltName=IP:${SERVER_IP}" 2>/dev/null
  log "SSL сертификат создан (действителен 10 лет)"
fi

# ── 7. nginx.conf для HTTPS ────────────────────────
info "Настройка nginx для HTTPS..."
cat > "$DEPLOY_DIR/frontend/nginx.conf" <<'NGINX'
server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name _;

    ssl_certificate     /etc/ssl/mercury/cert.pem;
    ssl_certificate_key /etc/ssl/mercury/key.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://backend:4000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io/ {
        proxy_pass http://backend:4000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
}
NGINX
log "nginx.conf настроен"

# ── 8. docker-compose.yml для HTTPS ───────────────
info "Настройка docker-compose для HTTPS..."
cat > "$DEPLOY_DIR/docker-compose.yml" <<'COMPOSE'
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${DB_USER:-mercury}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-mercury_pass}
      POSTGRES_DB: ${DB_NAME:-mercury_medet}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-mercury} -d ${DB_NAME:-mercury_medet}"]
      interval: 5s
      timeout: 5s
      retries: 10

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://${DB_USER:-mercury}:${DB_PASSWORD:-mercury_pass}@db:5432/${DB_NAME:-mercury_medet}
      JWT_SECRET: ${JWT_SECRET:?JWT_SECRET is required}
      JWT_EXPIRES_IN: ${JWT_EXPIRES_IN:-7d}
      PORT: 4000
      FRONTEND_URL: ${FRONTEND_URL}
      GREEN_API_URL: ${GREEN_API_URL:-}
      GREEN_API_ID_INSTANCE: ${GREEN_API_ID_INSTANCE:-}
      GREEN_API_TOKEN_INSTANCE: ${GREEN_API_TOKEN_INSTANCE:-}
      ADMIN_PHONE: ${ADMIN_PHONE:?ADMIN_PHONE is required}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD:?ADMIN_PASSWORD is required}
      ADMIN_FIRST_NAME: ${ADMIN_FIRST_NAME:-Администратор}
      ADMIN_LAST_NAME: ${ADMIN_LAST_NAME:-Системы}
    depends_on:
      db:
        condition: service_healthy

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /opt/mercury-medet/ssl:/etc/ssl/mercury:ro
    depends_on:
      - backend

volumes:
  pgdata:
COMPOSE
log "docker-compose.yml настроен"

# ── 9. Firewall ────────────────────────────────────
info "Настройка firewall..."
ufw --force reset >/dev/null 2>&1
ufw default deny incoming >/dev/null 2>&1
ufw default allow outgoing >/dev/null 2>&1
ufw allow 8022/tcp comment "SSH" >/dev/null 2>&1
ufw allow 80/tcp comment "HTTP" >/dev/null 2>&1
ufw allow 443/tcp comment "HTTPS" >/dev/null 2>&1
ufw --force enable >/dev/null 2>&1
log "Firewall настроен (порты: 8022, 80, 443)"

# ── 10. Сборка и запуск ────────────────────────────
cd "$DEPLOY_DIR"
info "Сборка Docker образов (2-5 минут)..."
docker compose build --no-cache

info "Запуск контейнеров..."
docker compose up -d

info "Ожидание запуска backend..."
for i in $(seq 1 30); do
  if docker compose logs backend 2>/dev/null | grep -q "Running on"; then
    break
  fi
  sleep 2
done

# ── 11. Проверка ───────────────────────────────────
echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}   Деплой завершён успешно!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo -e "  Сайт:    ${BLUE}https://${SERVER_IP}${NC}"
echo ""
echo -e "  Логин:   ${YELLOW}$(grep ADMIN_PHONE $DEPLOY_DIR/.env | cut -d= -f2)${NC}"
echo -e "  Пароль:  ${YELLOW}$(grep ADMIN_PASSWORD $DEPLOY_DIR/.env | cut -d= -f2)${NC}"
echo ""
echo -e "  ${YELLOW}Браузер покажет предупреждение об SSL — это нормально"
echo -e "  для IP-адреса без домена. Нажми 'Продолжить'.${NC}"
echo ""
echo -e "  Логи:    docker compose -f $DEPLOY_DIR/docker-compose.yml logs -f"
echo -e "  Стоп:    docker compose -f $DEPLOY_DIR/docker-compose.yml down"
echo ""
