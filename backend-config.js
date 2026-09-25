window.FIELDREADY_BACKEND = Object.freeze({
  enabled: true,
  url: 'https://raps-supabase.asuscomm.com/fieldready',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkwMjI3MjI5LCJleHAiOjE5NDc5MDcyMjl9.5-zqbGxF9Dy_nND6Whg5rwQyWD0hKgRN5a38xbflpWA',
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
