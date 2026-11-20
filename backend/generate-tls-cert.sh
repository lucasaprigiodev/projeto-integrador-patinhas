#!/usr/bin/env bash
set -euo pipefail
mkdir -p "$(dirname "$0")/certs"
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$(dirname "$0")/certs/server.key" \
  -out "$(dirname "$0")/certs/server.cert" \
  -days 365 \
  -subj "/C=BR/ST=RN/L=Natal/O=IFRN Projeto Patinhas/CN=localhost"
echo "Certificado TLS local gerado em backend/certs/server.{key,cert}"
