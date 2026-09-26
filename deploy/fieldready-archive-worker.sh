#!/usr/bin/env bash
set -euo pipefail

DB_CONTAINER="${FIELDREADY_DB_CONTAINER:-fieldready-db}"
ARCHIVE_ROOT="${FIELDREADY_ARCHIVE_ROOT:-/srv/fieldready-archives}"

mkdir -p "$ARCHIVE_ROOT"

docker exec "$DB_CONTAINER" psql -U postgres -d postgres -At -F $'\t' -P pager=off -c "
SELECT
  event_id::text,
  archive_month,
  file_name
FROM public.fr_event_archives
WHERE persisted_at IS NULL
ORDER BY closed_at, event_id;
" | while IFS=$'\t' read -r event_id archive_month file_name; do
  [ -n "$event_id" ] || continue

  case "$archive_month" in
    ????-??) ;;
    *) echo "Invalid archive month for $event_id: $archive_month" >&2; continue ;;
  esac

  if [[ ! "$file_name" =~ ^[A-Za-z0-9_.-]+\.csv$ ]]; then
    echo "Invalid archive filename for $event_id: $file_name" >&2
    continue
  fi

  month_dir="$ARCHIVE_ROOT/$archive_month"
  final_path="$month_dir/$file_name"
  tmp_path="$month_dir/.$file_name.$event_id.tmp"

  mkdir -p "$month_dir"

  docker exec "$DB_CONTAINER" psql -U postgres -d postgres -At -P pager=off -c "
SELECT encode(convert_to(csv_text,'UTF8'),'hex')
FROM public.fr_event_archives
WHERE event_id='$event_id'::uuid;
" | python3 -c 'import sys; data=sys.stdin.read().strip(); sys.stdout.buffer.write(bytes.fromhex(data))' > "$tmp_path"

  if [ ! -s "$tmp_path" ]; then
    echo "Archive CSV decode produced an empty file for $event_id" >&2
    rm -f "$tmp_path"
    exit 1
  fi

  if [ -e "$final_path" ]; then
    existing_sha="$(sha256sum "$final_path" | awk '{print $1}')"
    new_sha="$(sha256sum "$tmp_path" | awk '{print $1}')"
    if [ "$existing_sha" != "$new_sha" ]; then
      final_path="$month_dir/${file_name%.csv}_${event_id:0:8}.csv"
    fi
  fi

  mv -f "$tmp_path" "$final_path"
  chmod 0640 "$final_path"
  sha="$(sha256sum "$final_path" | awk '{print $1}')"

  docker exec "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -P pager=off -c "
UPDATE public.fr_event_archives
SET persisted_at=clock_timestamp(),
    persisted_path='$final_path',
    persisted_sha256='$sha'
WHERE event_id='$event_id'::uuid
  AND persisted_at IS NULL;
" >/dev/null

  echo "Archived FieldReady class $event_id -> $final_path"
done
