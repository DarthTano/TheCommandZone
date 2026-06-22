# Accounts & cloud-saved decks — setup

Login is **optional**. Without it, the app works exactly as before (decks saved in
your browser). When you sign in, your decks sync to the cloud and follow you
across devices — and your existing browser decks are imported into your account
automatically on first login.

This needs three quick one-time steps in your Supabase project (the same project
already used for online play). **Email + password works after steps 1–2.** Google
sign-in needs step 3.

## 1. Create the decks table (required)
Supabase dashboard → **SQL Editor** → **New query** → paste the contents of
[`supabase/schema.sql`](supabase/schema.sql) → **Run**. (Safe to run more than once.)

This creates one table, `user_decks`, with row-level security so each account can
only touch its own decks.

## 2. Make email signup instant (recommended)
By default Supabase emails a confirmation link before a new account can log in.
For a smoother experience:
- **Authentication → Providers → Email** → turn **off "Confirm email"** → Save.

Now signing up logs you straight in. (Leave it on if you'd rather verify emails —
users just have to click the link in their inbox first.)

## 3. Google sign-in (optional)
The "Continue with Google" button is already in the app; it works once you wire up
the provider:

1. **Google Cloud Console** → create an **OAuth 2.0 Client ID** (type: Web app).
   - Authorized redirect URI: your Supabase callback —
     `https://nztuotaqcizfzruaiemf.supabase.co/auth/v1/callback`
2. Copy the **Client ID** and **Client secret**.
3. Supabase → **Authentication → Providers → Google** → enable it, paste the
   Client ID + secret → Save.
4. Supabase → **Authentication → URL Configuration**:
   - **Site URL**: `https://the-command-zone-swdt.vercel.app`
   - **Redirect URLs**: add both
     `https://the-command-zone-swdt.vercel.app` and `http://localhost:5175`
     (so login works in production and in local dev).

## Notes
- The app degrades gracefully: if the table doesn't exist yet, decks just stay in
  your browser and you'll see a one-line hint to run the migration.
- Decks are stored as one JSON row per user — fine for personal use. (No public
  deck sharing yet.)
