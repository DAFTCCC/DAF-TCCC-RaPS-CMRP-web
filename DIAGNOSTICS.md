# Beta diagnostics

`diagnostics.js` silently records technical problems while the app is in use so they can be found and fixed. It has no visible UI and does not change app behavior.

## What is recorded

| Kind | Meaning |
|---|---|
| `js_error` | An uncaught JavaScript error or a script/resource that failed to load |
| `promise_rejection` | An unhandled asynchronous error |
| `request_failed` | A server request failed (network error or HTTP 4xx/5xx other than 401) |
| `request_slow` | A server request took longer than 5 seconds |
| `rage_click` | The same control clicked 4+ times within 2 seconds |
| `dead_click` | A button/link click produced no visible change, request or navigation within 1.2 seconds |
| `ui_freeze` | The page was unresponsive for 1 second or more (Chromium browsers) |
| `error_shown` | An error/warning message was shown to the user (toast or alert) |

Each event carries: time, a per-page-load session ID, app version, kind, current screen, the control (by element id/class, never visible text), a scrubbed message, code locations (file:line) for errors, the last 8 clicks/screen changes, browser user agent, viewport size, and online state. The server adds the signed-in user's account ID.

## What is never recorded

Participant IDs, names, ratings, comments, notes, request or response bodies, or anything typed by the user. Every message is scrubbed: UUIDs, emails, tokens, quoted values, Postgres key values and any word containing a digit are replaced before storage.

## Where it goes

1. Saved on the device (`localStorage` key `FIELDREADY_DIAG_V1`, newest 400 events).
2. Uploaded every 60 seconds, when the tab is hidden, and when connectivity returns, if the user is signed in and online, to `fr_client_diagnostics` (migration 016).
3. Users can only insert their own rows. Only Enterprise can read. No client updates or deletes. More than 500 rows per user per hour are dropped.

Developer access on a device (browser console): `FIELDREADY_DIAG.export()`.

## Reviewing results (Studio SQL editor on the LAN, or psql on the NUC)

Most common problems in the last 7 days:

```sql
select kind, view, target, message, count(*) as events, count(distinct user_id) as users,
       min(occurred_at) as first_seen, max(occurred_at) as last_seen
from fr_client_diagnostics
where received_at > now() - interval '7 days'
group by 1,2,3,4
order by events desc
limit 50;
```

Buttons that frustrate users:

```sql
select target, view, kind, count(*) as events, count(distinct user_id) as users
from fr_client_diagnostics
where kind in ('rage_click','dead_click')
group by 1,2,3
order by users desc, events desc;
```

Errors by app version and browser:

```sql
select app_version, split_part(user_agent,' ',1) as ua, kind, count(*)
from fr_client_diagnostics
where kind in ('js_error','promise_rejection','request_failed')
group by 1,2,3
order by 4 desc;
```

Full context for one event (what the user did just before):

```sql
select occurred_at, kind, view, target, message, detail
from fr_client_diagnostics
order by occurred_at desc
limit 20;
```

## Known limitations

- `dead_click` can flag buttons that open native dialogs (file picker, print, share sheet), because those make no page change.
- `ui_freeze` is only reported by Chromium-based browsers.
- Events from before sign-in are uploaded after the next sign-in on that device.
