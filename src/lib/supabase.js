// Null-safe Supabase client. The app runs fully in local mode until the two
// env vars are provided, at which point online play "lights up". Mirrors the
// pattern used in the gridiron project.
//
// To enable online play, copy .env.example to .env and fill in:
//   VITE_SUPABASE_URL=...
//   VITE_SUPABASE_ANON_KEY=...
// then restart `npm run dev`. See MULTIPLAYER_SETUP.md.

import { createClient } from '@supabase/supabase-js'

// Normalize the project URL: it must be the bare base (https://<ref>.supabase.co).
// People often paste the REST endpoint (".../rest/v1") by mistake, which makes the
// SDK build doubled paths like /rest/v1/auth/v1/authorize. Strip that + any
// trailing slash so a paste error can't break auth/realtime.
const rawUrl = import.meta.env.VITE_SUPABASE_URL
const url = rawUrl
  ? rawUrl.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '').replace(/\/+$/, '')
  : rawUrl
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isCloud = Boolean(url && anon)

export const supabase = isCloud
  ? createClient(url, anon, {
      realtime: { params: { eventsPerSecond: 20 } },
    })
  : null
