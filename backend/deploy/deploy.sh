#!/usr/bin/env bash
# Sube el backend al EC2 y (re)inicia el servicio. Volver a correr = redeploy.
set -euo pipefail

HOST="ubuntu@54.83.16.222"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
KEY="$ROOT_DIR/losherederos.pem"
BACKEND_DIR="$ROOT_DIR/backend"
REMOTE_DIR="/home/ubuntu/egg-api"

chmod 600 "$KEY"

echo "Subiendo codigo y modelo a $HOST..."
ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST" "mkdir -p $REMOTE_DIR"
scp -i "$KEY" -r "$BACKEND_DIR/app" "$BACKEND_DIR/model" "$BACKEND_DIR/requirements.txt" "$HOST:$REMOTE_DIR/"
scp -i "$KEY" "$BACKEND_DIR/deploy/egg-api.service" "$HOST:/tmp/egg-api.service"

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
sudo mv /tmp/egg-api.service /etc/systemd/system/egg-api.service
sudo systemctl daemon-reload
sudo systemctl enable egg-api
sudo systemctl restart egg-api
sleep 2
sudo systemctl --no-pager --full status egg-api
REMOTE

echo "Listo. Prueba con: curl http://54.83.16.222:8000/health"
