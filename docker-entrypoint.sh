#!/bin/sh
set -e

echo "Waiting for Postgres at ${POSTGRES_HOST}:${POSTGRES_PORT}..."
until python - <<'PYEOF'
import os
import socket
import sys

host = os.environ.get("POSTGRES_HOST", "db")
port = int(os.environ.get("POSTGRES_PORT", "5432"))
try:
    with socket.create_connection((host, port), timeout=2):
        sys.exit(0)
except OSError:
    sys.exit(1)
PYEOF
do
  sleep 1
done
echo "Postgres is up."

echo "Applying shared-schema migrations..."
python manage.py migrate_schemas --shared

exec "$@"
