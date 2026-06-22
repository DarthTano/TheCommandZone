# Online play setup (≈5 minutes, one time)

The Command Zone plays **locally** with no setup. To play **online with friends**
(live-synced life totals, commander damage, turns, dice, log + chat), connect a
free Supabase project. Online play uses only Supabase **Realtime** — no database
tables, no login, no schema to run.

## Steps

1. **Create a project** at https://supabase.com (free tier is plenty).
   Pick any name/region; wait ~1 minute for it to provision.

2. **Copy your keys.** In the project dashboard go to **Settings → API** and copy:
   - **Project URL**  → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`

3. **Add them to the app.** In the project folder, copy `.env.example` to `.env`
   and paste the two values:

   ```
   VITE_SUPABASE_URL=https://YOURPROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

4. **Restart the dev server** (`npm run dev`). The Play page's online section
   lights up.

That's it — Realtime is enabled by default on new projects, so there's nothing
else to configure.

## How to play online

- One player clicks **Create room** and shares the **4-letter code**.
- Friends open the app, type their name + the code, and click **Join**.
- Everyone sees the same table update live. Anyone can adjust any life total
  (it's a trust-based tracker, like physical life pads). Click **sit** to put
  your name on a seat; attach one of your saved decks to show your commander.

## Notes / limits

- State lives in the **host's** browser and is shared peer-to-peer over Realtime.
  If the host closes the tab, the room ends. (Late joiners get the current board
  automatically from the host.)
- No accounts are required for play. Decks are still stored locally per browser.
- The `.env` file is gitignored — your keys won't be committed.
