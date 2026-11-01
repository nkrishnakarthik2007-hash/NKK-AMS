# Setup guide
1. `web/js/config.js`: paste your **publishable** key (Supabase → Settings → API). Never the service_role key.
2. Supabase → Authentication → Providers → Email: disable "Confirm email".
3. SQL Editor: run the files in the order listed in DATABASE_SETUP.md.
4. Authentication → Users → Add user: email `241536@ams.example.com`, your own password, tick **Auto Confirm User**. (If it already exists, open it and confirm it / set the password there.)
5. Run `supabase/bootstrap/CREATE_SUPER_ADMIN_PROFILE.sql`.
6. Deploy functions (Supabase CLI installed):
```
supabase login
supabase link --project-ref dggokugqqeddfydcjvpb
supabase functions deploy admin-users
supabase functions deploy password-reset
```
7. Push to GitHub: `git add . && git commit -m "Rebuild AMS" && git push origin main`
8. GitHub repo → Settings → Pages → Source = **GitHub Actions** (NOT "Deploy from a branch"). Site: https://nkrishnakarthik2007-hash.github.io/NKK-AMS/
