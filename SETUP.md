# Student Attendance Register — Final Setup Guide

This folder is the complete project.

## Folder structure

- index.html — website
- style.css — website design
- script.js — website logic
- config.js — Supabase URL + publishable key
- README.md — project notes
- supabase/schema.sql — database tables + RLS
- supabase/functions/admin-users/index.ts — secure admin user-management function
- supabase/config.toml — only needed if you later use the Supabase CLI

## IMPORTANT: which files are current?

Use ALL files in this folder together.

Do NOT use an older `index.ts` that uses `createClient(...SUPABASE_SERVICE_ROLE_KEY...)`.
The current `admin-users/index.ts` uses Supabase's current `withSupabase({ auth: "user" })` approach.

## Supabase settings already completed

1. Database schema has been run.
2. First ADMIN profile has been created.
3. `admin-users` has been deployed from the Supabase Dashboard.
4. In the Dashboard, the setting named **Verify JWT with legacy secret** is OFF.
   Leave it OFF for this current function code.
5. Do not paste a secret/service-role key into any website file or GitHub.

## Step 1 — Edit config.js

Open `config.js`.

Replace:

    YOUR_SUPABASE_URL_HERE

with your Supabase Project URL.

Replace:

    YOUR_SUPABASE_PUBLISHABLE_KEY_HERE

with your `sb_publishable_...` key.

The file should look like:

    const SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
    const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_...";

Do NOT put a secret key here.

## Step 2 — Save

Save `config.js` with Ctrl+S.

## Step 3 — Test the website

Double-click `index.html`.

Login with:

- Employee ID: ADMIN001
- Password: the password you created for the first admin

After login:

1. Open Students.
2. Add one test student.
3. Open Users.
4. Add one test USER.
5. Logout.
6. Login as the new USER.
7. Add/choose a date.
8. Mark Present or Absent.
9. Save Attendance.
10. Open Monthly Attendance and check the saved record.

## Step 4 — Do not mix old files

Do not copy the old `index.ts`, old `schema.sql`, or old localStorage `script.js` over these files.

The website files and the newer Supabase backend files in this folder are intended to work together.

## Security

Safe to publish:
- Supabase Project URL
- Supabase publishable key

Never publish:
- Supabase secret key
- service_role key
- database password

The admin Edge Function receives its private server key from Supabase; you do not put that key in the website.

## GitHub Pages

After the local test works, upload the contents of this project to GitHub.

Keep the `supabase` folder in the repository.

Then enable GitHub Pages from the `main` branch and root folder.
