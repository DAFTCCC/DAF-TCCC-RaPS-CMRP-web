#!/usr/bin/env bash
# Run on the NUC from v4.6.0 or later. Dedicated FieldReady stack only.
set -euo pipefail
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
functions_root=/home/deno/functions
backup_dir="${FIELDREADY_BACKUP_DIR:-$HOME/fieldready-backups}"
mount_ok=$(docker inspect --format '{{range .Mounts}}{{if and (eq .Destination "/home/deno/functions") .RW}}yes{{end}}{{end}}' fieldready-edge-functions)
if [[ "$mount_ok" != yes ]]; then
  echo 'Expected persistent writable FieldReady functions mount is missing. No changes were made.' >&2
  exit 1
fi
username_ready=$(docker exec fieldready-db psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc \
  "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='fr_profiles' and column_name='username') and to_regprocedure('public.fr_resolve_login(text)') is not null;")
if [[ "$username_ready" != t ]]; then
  echo 'Install the FieldReady username update (migration 013) first. No changes were made.' >&2
  exit 1
fi
docker exec fieldready-edge-functions sh -c 'test -n "$SUPABASE_URL" && test -n "$SUPABASE_SERVICE_ROLE_KEY"' || {
  echo 'FieldReady functions need the existing server-side SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. No changes were made.' >&2
  exit 1
}
umask 077
mkdir -p "$backup_dir"
stamp=$(date -u +%Y%m%d-%H%M%S)
backup_file="$backup_dir/fieldready-before-temporary-passwords-$stamp.dump"
docker exec fieldready-db pg_dump -U postgres -d postgres -Fc > "$backup_file"
test -s "$backup_file"
docker exec -i fieldready-db pg_restore --list < "$backup_file" > /dev/null
echo "Dedicated FieldReady database backup saved: $backup_file"
function_file="$functions_root/fieldready-account-admin/index.ts"
if docker exec fieldready-edge-functions test -f "$function_file"; then
  function_backup="$backup_dir/fieldready-account-admin-before-$stamp.ts"
  docker cp "fieldready-edge-functions:$function_file" "$function_backup"
  chmod 600 "$function_backup"
fi
# Transactional, repeatable migration. Existing ordinary accounts remain active.
docker exec -i fieldready-db psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < "$repo_dir/supabase/014_temporary_passwords.sql"
docker exec --user 0 fieldready-edge-functions mkdir -p "$functions_root/fieldready-account-admin"
docker cp "$repo_dir/supabase/functions/fieldready-account-admin/index.ts" \
  "fieldready-edge-functions:$function_file"
docker exec --user 0 fieldready-edge-functions chmod 755 "$functions_root/fieldready-account-admin"
docker exec --user 0 fieldready-edge-functions chmod 644 "$function_file"
docker restart fieldready-edge-functions > /dev/null
echo 'FieldReady temporary-password migration and account function installed.'
echo 'Refresh FieldReady v4.6.0 or later. Enterprise: Users > Create User, or Manage > Reset temporary password.'
echo 'Test a disposable account: temporary login must require a private replacement password before study access.'
echo 'No invitation email is sent by Create User. Temporary setup expires after 24 hours; reissue if needed.'
