# Database setup – run in Supabase SQL Editor, in this order
1. `supabase/reset/RESET_OLD_AMS_DATABASE.sql` – DESTRUCTIVE, deletes old AMS data in `public` only. Skip on an empty database.
2. `supabase/migrations/001_ams_schema.sql` – tables, constraints, indexes, triggers, RLS.
3. `supabase/bootstrap/CREATE_SUPER_ADMIN_PROFILE.sql` – after creating the Auth user (SETUP_GUIDE step 4).
Tables: profiles, students, attendance (unique student_id+attendance_date), holidays, password_reset_requests, admin_contacts.
Students/attendance have no DELETE policy; history is kept. A trigger rejects attendance on holidays or outside joining/leaving dates.
