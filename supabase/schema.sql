-- Student Attendance Register: database schema + security rules (RLS)
-- Paste this WHOLE file into Supabase > SQL Editor > New query > Run.

-- ---------- TABLES ----------
create table public.profiles (          -- one row per login user
  id uuid primary key references auth.users(id) on delete cascade,
  employee_id text not null,
  name text not null,
  role text not null default 'USER' check (role in ('ADMIN','USER')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_employee_id_key on public.profiles (lower(employee_id));

create table public.students (          -- the trainees
  id uuid primary key default gen_random_uuid(),
  employee_id text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.attendance_dates (  -- dates added in the Daily screen
  attendance_date date primary key,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.attendance (        -- one row per student per date
  id uuid primary key default gen_random_uuid(),
  attendance_date date not null references public.attendance_dates(attendance_date) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null check (status in ('Present','Absent')),
  marked_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attendance_date, student_id)
);

-- ---------- AUTOMATIC FIELDS ----------
-- Sets updated_at, and records WHO marked attendance (cannot be faked from the browser).
create function public.set_audit_fields() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_table_name = 'attendance' then new.marked_by := auth.uid(); end if;
  return new;
end $$;
create trigger t_profiles   before insert or update on public.profiles   for each row execute function public.set_audit_fields();
create trigger t_students   before insert or update on public.students   for each row execute function public.set_audit_fields();
create trigger t_attendance before insert or update on public.attendance for each row execute function public.set_audit_fields();

-- Records WHO added a date (cannot be faked from the browser).
create function public.set_created_by() returns trigger language plpgsql as $$
begin
  new.created_by := auth.uid();
  return new;
end $$;
create trigger t_dates before insert on public.attendance_dates for each row execute function public.set_created_by();

-- ---------- HELPER CHECKS ----------
create function public.is_active_user() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active) $$;
create function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'ADMIN') $$;

-- ---------- SECURITY RULES (RLS) ----------
revoke all on all tables in schema public from anon;   -- not-logged-in visitors get nothing

alter table public.profiles         enable row level security;
alter table public.students         enable row level security;
alter table public.attendance_dates enable row level security;
alter table public.attendance       enable row level security;

-- profiles: you can read your own row; admins can read all. Nobody can change profiles
-- from the browser (only the admin-users Edge Function can), so no one can make themselves ADMIN.
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- students: any active user can read; only admins can add / edit / delete.
create policy students_read   on public.students for select to authenticated using (public.is_active_user());
create policy students_insert on public.students for insert to authenticated with check (public.is_admin());
create policy students_update on public.students for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy students_delete on public.students for delete to authenticated using (public.is_admin());

-- dates: any active user can read and add dates.
create policy dates_read   on public.attendance_dates for select to authenticated using (public.is_active_user());
create policy dates_insert on public.attendance_dates for insert to authenticated with check (public.is_active_user());

-- attendance: any active user can read, mark and change attendance. Nobody can delete from the browser.
create policy att_read   on public.attendance for select to authenticated using (public.is_active_user());
create policy att_insert on public.attendance for insert to authenticated with check (public.is_active_user());
create policy att_update on public.attendance for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
