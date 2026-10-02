#!/bin/sh
# Prepare the database, load the demo company, print the login, then serve NexusERP on port 8000.
set -e

# Keep .env (secret key + demo password) in a volume so the login survives container rebuilds.
mkdir -p env-store
ln -sf env-store/.env .env
if [ ! -f env-store/.env ]; then
  SECRET=$(python -c "import secrets; print(secrets.token_urlsafe(50))")
  {
    echo "DJANGO_SECRET_KEY=$SECRET"
    echo "DJANGO_DEBUG=1"
    echo "DJANGO_ALLOWED_HOSTS=*"
    echo "DB_NAME=${DB_NAME:-nexuserp}"
    echo "DB_USER=${DB_USER:-postgres}"
    echo "DB_PASSWORD=${DB_PASSWORD:-postgres}"
    echo "DB_HOST=${DB_HOST:-db}"
    echo "DB_PORT=${DB_PORT:-5432}"
  } > env-store/.env
fi

echo "Waiting for PostgreSQL..."
until python -c "import os, psycopg; psycopg.connect(host='${DB_HOST:-db}', port='${DB_PORT:-5432}', user='${DB_USER:-postgres}', password='${DB_PASSWORD:-postgres}', dbname='${DB_NAME:-nexuserp}').close()" 2>/dev/null; do
  sleep 1
done

python manage.py migrate --verbosity 0
python manage.py seed_demo

PASSWORD=$(grep '^DEMO_PASSWORD=' .env | cut -d= -f2-)
echo ""
echo "  ------------------------------------------------------------"
echo "   NexusERP is ready:  http://localhost:8000"
echo "   Username:           demo"
echo "   Password:           ${PASSWORD:-see DEMO_PASSWORD}"
echo "  ------------------------------------------------------------"
echo ""

exec python manage.py runserver 0.0.0.0:8000 --noreload
