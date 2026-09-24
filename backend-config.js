window.FIELDREADY_BACKEND = Object.freeze({
  enabled: false,
  url: 'https://FIELDREADY-BACKEND.example.com',
  anonKey: 'REPLACE_WITH_FIELDREADY_ANON_KEY',
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
