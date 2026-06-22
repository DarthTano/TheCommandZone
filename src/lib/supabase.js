// Null-safe Supabase client. The app runs fully in local mode until the two
// env vars are provided, at which point online play "lights up". Mirrors the
// pattern used in the gridiron project.
//
// To enable online play, copy .env.example to .env and fill in:
//   VITE_SUPABASE_URL=...
//   VITE_SUPABASE_ANON_KEY=...
// then restart `npm run dev`. See MULTIPLAYER_SETUP.md.

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isCloud = Boolean(url && anon)

export const supabase = isCloud
  ? createClient(url, anon, {
      realtime: { params: { eventsPerSecond: 20 } },
    })
  : null
