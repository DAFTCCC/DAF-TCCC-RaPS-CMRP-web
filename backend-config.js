window.FIELDREADY_BACKEND = Object.freeze({
  enabled: true,
  url: 'https://raps-supabase.asuscomm.com/fieldready',
  anonKey: 'PASTE_YOUR_FIELDREADY_ANON_KEY_HERE',
  auth: Object.freeze({
    sessionKey: 'FIELDREADY_SUPABASE_SESSION_V1'
  }),
  tables: Object.freeze({
    events: 'fr_events',
    participants: 'fr_participants',
    evaluations: 'fr_evaluations',
    voids: 'fr_voids'
  }),
  autoSyncDelayMs: 1500
});
