-- Run AFTER 001_ams_schema.sql AND after creating the Auth user (see SETUP_GUIDE.md). No password here.
do $$ declare uid uuid; begin
  select id into uid from auth.users where email='241536@ams.example.com';
  if uid is null then raise exception 'Auth user 241536@ams.example.com not found. Create it in Authentication > Users first.'; end if;
  insert into public.profiles(id,employee_id,name,email,phone,role,is_active)
  values (uid,'241536','Super Admin','nkrishnakarthik2007@gmail.com','9490091800','super_admin',true)
  on conflict (id) do update set role='super_admin', is_active=true, employee_id='241536';
end $$;
