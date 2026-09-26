#!/usr/bin/env bash
# Sube el backend al EC2 y (re)inicia el servicio. Volver a correr = redeploy.
set -euo pipefail

HOST="ubuntu@54.83.16.222"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
KEY="$ROOT_DIR/losherederos.pem"
BACKEND_DIR="$ROOT_DIR/backend"
WEB_DIR="$ROOT_DIR/web"
REMOTE_DIR="/home/ubuntu/egg-api"

chmod 600 "$KEY"

echo "Compilando la web..."
(cd "$WEB_DIR" && npm run build >/dev/null)

echo "Subiendo codigo, modelo y web a $HOST..."
ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST" "mkdir -p $REMOTE_DIR"
scp -i "$KEY" -r "$BACKEND_DIR/app" "$BACKEND_DIR/model" "$BACKEND_DIR/requirements.txt" "$HOST:$REMOTE_DIR/"
scp -i "$KEY" -r "$WEB_DIR/dist" "$HOST:$REMOTE_DIR/web_new"
ssh -i "$KEY" "$HOST" "rm -rf $REMOTE_DIR/web && mv $REMOTE_DIR/web_new $REMOTE_DIR/web"
scp -i "$KEY" "$BACKEND_DIR/deploy/egg-api.service" "$HOST:/tmp/egg-api.service"
scp -i "$KEY" "$BACKEND_DIR/deploy/egg-api-tls.service" "$HOST:/tmp/egg-api-tls.service"

echo "Instalando dependencias y arrancando el servicio..."
ssh -i "$KEY" "$HOST" bash -s <<'REMOTE'
set -e
sudo apt-get update -qq
sudo apt-get install -y -qq python3-venv python3-pip libgl1 libglib2.0-0
cd /home/ubuntu/egg-api
python3 -m venv venv
mkdir -p tmp-pip
export TMPDIR="/home/ubuntu/egg-api/tmp-pip"  # /tmp tiene cuota chica en esta AMI y tumba la descarga de torch
./venv/bin/pip install --upgrade pip -q
./venv/bin/pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu -q
./venv/bin/pip install -r requirements.txt -q
rm -rf tmp-pip

mkdir -p certs
if [ ! -f certs/cert.pem ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -keyout certs/key.pem -out certs/cert.pem -days 825 -subj '/CN=54.83.16.222'
fi

sudo mv /tmp/egg-api.service /etc/systemd/system/egg-api.service
sudo mv /tmp/egg-api-tls.service /etc/systemd/system/egg-api-tls.service
sudo systemctl daemon-reload
sudo systemctl enable egg-api egg-api-tls
sudo systemctl restart egg-api egg-api-tls
sleep 2
sudo systemctl --no-pager --full status egg-api egg-api-tls
REMOTE

echo "Listo."
echo "API para la app movil (HTTP):  http://54.83.16.222:8080"
echo "Web con camara (HTTPS, certificado autofirmado): https://54.83.16.222:8443"
