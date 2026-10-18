#!/usr/bin/env bash
# Run from a checkout containing v4.5.0 on the NUC. FieldReady stack only.
set -euo pipefail
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
functions_root=/home/deno/functions
backup_dir="${FIELDREADY_BACKUP_DIR:-$HOME/fieldready-backups}"

# Refuse an ephemeral install: the standard functions directory must be persisted.
mount_ok=$(docker inspect --format '{{range .Mounts}}{{if and (eq .Destination "/home/deno/functions") .RW}}yes{{end}}{{end}}' fieldready-edge-functions)
if [[ "$mount_ok" != yes ]]; then
  echo 'The FieldReady runtime does not have the expected writable functions mount.' >&2
  echo 'Install the fieldready-login directory in its actual persistent functions mount before applying migration 013. No changes were made.' >&2
  exit 1
fi
docker exec fieldready-db psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc \
  "select 'FieldReady accounts: '||count(*) from public.fr_profiles;"
docker exec fieldready-edge-functions sh -c 'test -n "$SUPABASE_URL" && test -n "$SUPABASE_SERVICE_ROLE_KEY"' || {
  echo 'The FieldReady functions runtime needs its server-side SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. No changes were made.' >&2
  exit 1
}
umask 077
mkdir -p "$backup_dir"
backup_file="$backup_dir/fieldready-before-usernames-$(date -u +%Y%m%d-%H%M%S).dump"
docker exec fieldready-db pg_dump -U postgres -d postgres -Fc > "$backup_file"
test -s "$backup_file"
docker exec -i fieldready-db pg_restore --list < "$backup_file" > /dev/null
echo "Dedicated FieldReady database backup saved: $backup_file"

docker exec --user 0 fieldready-edge-functions mkdir -p "$functions_root/fieldready-login"
docker cp "$repo_dir/supabase/functions/fieldready-login/index.ts" \
  "fieldready-edge-functions:$functions_root/fieldready-login/index.ts"
docker exec --user 0 fieldready-edge-functions chmod 755 "$functions_root/fieldready-login"
docker exec --user 0 fieldready-edge-functions chmod 644 "$functions_root/fieldready-login/index.ts"
docker exec -i fieldready-db psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < "$repo_dir/supabase/013_username_login.sql"
docker restart fieldready-edge-functions > /dev/null
echo 'Username migration and login function installed in FieldReady.'
echo 'Keep your existing email sign-in available. In Account, save a username, then lock and sign in with that username and your existing password.'
echo 'Verify one account for each role and a second device before wider use.'
