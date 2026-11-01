-- AMS schema. Run AFTER RESET_OLD_AMS_DATABASE.sql (or on a fresh project).
create type app_role as enum ('super_admin','admin','teacher');

create table profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  employee_id text unique not null,
  name text not null, email text, phone text,
  role app_role not null default 'teacher',
  is_active boolean not null default true,
  created_at timestamptz default now(), updated_at timestamptz default now());

create table students(
  id uuid primary key default gen_random_uuid(),
  employee_id text unique not null,
  name text not null,
  joining_date date not null, left_date date,
  created_by uuid references profiles(id),
  created_at timestamptz default now(), updated_at timestamptz default now(),
  check (left_date is null or left_date >= joining_date));

create table attendance(
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete restrict,
  attendance_date date not null,
  status text not null check (status in ('present','absent')),
  marked_by uuid references profiles(id),
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (student_id, attendance_date));
create index on attendance(attendance_date);

create table holidays(
  holiday_date date primary key, reason text,
  created_by uuid references profiles(id), created_at timestamptz default now());

create table password_reset_requests(
  id uuid primary key default gen_random_uuid(),
  employee_id text not null, note text,
  status text not null default 'pending' check (status in ('pending','done')),
  created_at timestamptz default now(), handled_by uuid references profiles(id));

create table admin_contacts(
  id uuid primary key default gen_random_uuid(),
  employee_id text unique, name text not null, whatsapp text, email text,
  is_active boolean not null default true);
insert into admin_contacts(employee_id,name,whatsapp,email)
values ('241536','Super Admin','9490091800','nkrishnakarthik2007@gmail.com');

create function my_role() returns app_role language sql stable security definer set search_path=public as
$$ select role from profiles where id=auth.uid() and is_active $$;

create function touch() returns trigger language plpgsql as
$$ begin new.updated_at=now(); return new; end $$;
create trigger t1 before update on profiles for each row execute function touch();
create trigger t2 before update on students for each row execute function touch();

create function chk_att() returns trigger language plpgsql as $$
declare s students;
begin
  select * into s from students where id=new.student_id;
  if exists(select 1 from holidays where holiday_date=new.attendance_date) then
    raise exception 'Cannot mark attendance on a holiday'; end if;
  if new.attendance_date < s.joining_date or (s.left_date is not null and new.attendance_date > s.left_date) then
    raise exception 'Student was not enrolled on this date'; end if;
  new.marked_by := auth.uid(); new.updated_at := now();
  return new;
end $$;
create trigger t3 before insert or update on attendance for each row execute function chk_att();

create function day_summary(d1 date,d2 date)
returns table(attendance_date date,present int,absent int) language sql stable security invoker as
$$ select a.attendance_date, (count(*) filter (where status='present'))::int,
          (count(*) filter (where status='absent'))::int
   from attendance a where a.attendance_date between d1 and d2 group by 1 $$;

create function request_password_reset(emp text, note text) returns void
language sql security definer set search_path=public as
$$ insert into password_reset_requests(employee_id,note) values (left(trim(emp),30), left(note,300)) $$;
grant execute on function request_password_reset to anon, authenticated;

-- RLS. No DELETE policy on students/attendance: history is never deleted.
alter table profiles enable row level security;
alter table students enable row level security;
alter table attendance enable row level security;
alter table holidays enable row level security;
alter table password_reset_requests enable row level security;
alter table admin_contacts enable row level security;

create policy p_prof_sel on profiles for select to authenticated
  using (id=auth.uid() or my_role() in ('admin','super_admin'));
create policy st_sel on students for select to authenticated using (my_role() is not null);
create policy st_ins on students for insert to authenticated with check (my_role() is not null);
create policy st_upd on students for update to authenticated using (my_role() is not null) with check (my_role() is not null);
create policy at_sel on attendance for select to authenticated using (my_role() is not null);
create policy at_ins on attendance for insert to authenticated with check (my_role() is not null);
create policy at_upd on attendance for update to authenticated using (my_role() is not null) with check (my_role() is not null);
create policy ho_sel on holidays for select to authenticated using (my_role() is not null);
create policy ho_ins on holidays for insert to authenticated with check (my_role() in ('admin','super_admin'));
create policy ho_upd on holidays for update to authenticated using (my_role() in ('admin','super_admin')) with check (my_role() in ('admin','super_admin'));
create policy ho_del on holidays for delete to authenticated using (my_role() in ('admin','super_admin'));
create policy pr_sel on password_reset_requests for select to authenticated using (my_role() in ('admin','super_admin'));
create policy pr_upd on password_reset_requests for update to authenticated using (my_role() in ('admin','super_admin'));
create policy ac_sel_anon on admin_contacts for select to anon using (is_active);
create policy ac_sel on admin_contacts for select to authenticated using (is_active or my_role()='super_admin');
create policy ac_all on admin_contacts for all to authenticated using (my_role()='super_admin') with check (my_role()='super_admin');
