# Going public (deploy)

The Command Zone is a static Vite single-page app. It hosts for free on Vercel
(or Netlify/Cloudflare Pages). Card data comes from Scryfall, which needs no key
and allows browser requests — so **deck building works as soon as it's deployed**,
with zero backend. Online play with friends additionally needs a free Supabase
project (see `MULTIPLAYER_SETUP.md`).

## 1. Put the code on GitHub
```bash
# create an empty repo named "the-command-zone" on github.com first, then:
git remote add origin https://github.com/<your-username>/the-command-zone.git
git push -u origin master
```

## 2. Deploy on Vercel
1. Sign in at https://vercel.com with your GitHub account.
2. **Add New → Project** → import the `the-command-zone` repo.
3. Vercel auto-detects Vite. Defaults are correct:
   - Build command: `vite build` (or `npm run build`)
   - Output directory: `dist`
4. Click **Deploy**. You get a public `https://<name>.vercel.app` URL.
   - Every push to `master` re-deploys automatically.
   - `vercel.json` is already included so deep links (e.g. `/decks/123`) work.

That's enough for a public deck builder.

## 3. Enable online play (optional)
1. Create a free project at https://supabase.com.
2. Copy **Project URL** and the **anon public** key (Settings → API).
3. In Vercel: **Project → Settings → Environment Variables**, add:
   - `VITE_SUPABASE_URL` = your project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key
4. **Redeploy** (Deployments → ⋯ → Redeploy) so the build picks up the vars.

Now the Play page's online section is live: create a room, share the 4-letter
code, friends join from anywhere. Realtime works over HTTPS automatically.

## Notes
- The `.env` file is only for local dev and is gitignored. In production the
  same two `VITE_` variables live in Vercel's env settings instead.
- No card images are hosted by us — they load from Scryfall's CDN.
- Heads-up: "The Command Zone" is also a well-known MTG podcast/brand. Fine for a
  personal/unlisted project; pick a distinct name if you publish it widely.
