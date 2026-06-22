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
The "Continue with Google" button is already in the app. Two halves: create
credentials in Google Cloud, then paste them into Supabase.

### Part A — Google Cloud Console
1. **console.cloud.google.com** → create or select a project.
2. **APIs & Services → OAuth consent screen**:
   - User type **External** → Create.
   - App name, support email, developer email → save through the steps.
   - Scopes: leave defaults (email, profile, openid).
   - **Test users**: add you + friends' Google emails, OR click **Publish app**
     on the consent-screen overview. Publishing with only basic scopes needs no
     Google review and removes the "test users only" limit — recommended.
3. **APIs & Services → Credentials → + Create Credentials → OAuth client ID**:
   - Application type **Web application**.
   - **Authorized redirect URIs** → add exactly:
     `https://nztuotaqcizfzruaiemf.supabase.co/auth/v1/callback`
   - Create → copy the **Client ID** and **Client secret**.

### Part B — Supabase
4. **Authentication → Providers → Google** → enable → paste Client ID + secret → Save.
5. **Authentication → URL Configuration**:
   - **Site URL**: `https://the-command-zone-swdt.vercel.app`
   - **Redirect URLs** (the app redirects to `/decks` after login — wildcards cover it):
     `https://the-command-zone-swdt.vercel.app/**`
     `http://localhost:5175/**`

Troubleshooting: a "redirect URI mismatch" means the URI in step 3 doesn't exactly
match the Supabase callback. An "unverified app" warning in test mode is normal —
publish the consent screen (step 2) to remove it.

## Notes
- The app degrades gracefully: if the table doesn't exist yet, decks just stay in
  your browser and you'll see a one-line hint to run the migration.
- Decks are stored as one JSON row per user — fine for personal use. (No public
  deck sharing yet.)
