-- ============================================================================
-- auth_migration.sql — move the app from anonymous auth to real auth + strict RLS
--
-- HOW TO RUN
--   Supabase Dashboard → SQL Editor → paste this whole file → Run (once).
--   Sections are idempotent (`if not exists` / `drop policy if exists`), so you
--   can re-run it safely.
--
-- WHAT IT DOES
--   1. Adds user_profiles.email/username/role/full_name and class_sessions.teacher_id
--   2. Creates teacher_invites (invite codes that grant the "teacher" role)
--   3. Helper functions: is_teacher() / is_team_member() / can_read_cell() / can_edit_cell()
--   4. Signup trigger: role is decided SERVER-SIDE (invite code), email is
--      auto-confirmed (@students.local can't receive mail) and a profile row is
--      created with the display name from the signup form
--   5. Column-level grants so users cannot edit their own role/email/username
--   6. RLS policies for every table, keyed on auth.uid() + role
--   7. Revokes anon access to all public tables
--   8. Deletes the old anonymous users from auth.users
--
-- DASHBOARD SETTINGS (Auth → Providers → Email)
--   * "Confirm email" can stay ON — the trigger confirms @students.local
--     addresses automatically. If you turn it OFF everything still works.
--   * Anonymous sign-in must be OFF (Auth → Providers → Anonymous sign-ins).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Columns
-- ---------------------------------------------------------------------------
alter table public.user_profiles
  add column if not exists email text,
  add column if not exists username text,
  add column if not exists full_name text,
  add column if not exists role text not null default 'student';

alter table public.class_sessions
  add column if not exists teacher_id uuid references auth.users (id) on delete set null;

create index if not exists class_sessions_teacher_id_idx on public.class_sessions (teacher_id);
create index if not exists user_profiles_role_idx on public.user_profiles (role);

-- Existing rows: nobody is a teacher until an invite says so.
update public.user_profiles set role = 'student' where role is null;

-- ---------------------------------------------------------------------------
-- 2) Teacher invite codes (readable only by the signup trigger / postgres)
-- ---------------------------------------------------------------------------
create table if not exists public.teacher_invites (
  code       text primary key,
  note       text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.teacher_invites enable row level security;
-- no policies on purpose → nobody can read or write it from the client
revoke all on table public.teacher_invites from anon, authenticated;

insert into public.teacher_invites (code, note)
values ('PY-TEACHER-2025', 'default faculty invite code')
on conflict (code) do nothing;

-- Manage codes with:
--   insert into public.teacher_invites (code, note) values ('MY-CODE', 'x');
--   update public.teacher_invites set active = false where code = 'OLD-CODE';

-- ---------------------------------------------------------------------------
-- 3) Helper functions (SECURITY DEFINER → they bypass RLS, no recursion)
-- ---------------------------------------------------------------------------
create or replace function public.is_teacher()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles p
    where p.user_id = auth.uid() and p.role = 'teacher'
  )
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'teacher';
$$;

create or replace function public.is_class_owner(p_class uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.class_sessions c
    where c.id = p_class and c.teacher_id = auth.uid()
  );
$$;

create or replace function public.is_team_member(p_team uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members m
    where m.team_id = p_team and m.user_id = auth.uid()
  );
$$;

-- A cell is visible/editable to: its author, any teacher, and teammates.
create or replace function public.can_read_cell(p_cell uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cells c
    where c.id = p_cell
      and (
        c.author_id = auth.uid()
        or public.is_teacher()
        or (c.team_id is not null and public.is_team_member(c.team_id))
      )
  );
$$;

create or replace function public.can_edit_cell(p_cell uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.can_read_cell(p_cell);
$$;

-- ---------------------------------------------------------------------------
-- 4) Signup trigger: role is decided server-side
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  meta      jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  requested text  := coalesce(meta ->> 'role', 'student');
  invite    text  := upper(trim(coalesce(meta ->> 'invite_code', '')));
  granted   text  := 'student';
  fname     text  := coalesce(nullif(trim(coalesce(meta ->> 'full_name', '')), ''), 'کاربر جدید');
  mail      text  := new.email;
  uname     text  := null;
begin
  -- "teacher" is only granted with a valid, active invite code.
  -- (Students can NOT self-escalate by sending role: 'teacher' from the client.)
  if requested = 'teacher' then
    if invite <> '' and exists (
      select 1 from public.teacher_invites i
      where i.code = invite and i.active
    ) then
      granted := 'teacher';
    end if;
  end if;

  -- student username = the local part of the fake @students.local address
  if mail is not null and lower(mail) like '%@students.local' then
    uname := split_part(lower(mail), '@', 1);
  end if;

  -- keep both metadata blobs in sync with the *granted* role so the client
  -- (user_metadata) and the JWT (app_metadata) never disagree with the DB.
  new.raw_app_meta_data  := coalesce(new.raw_app_meta_data, '{}'::jsonb)
                            || jsonb_build_object('role', granted);
  new.raw_user_meta_data := meta || jsonb_build_object('role', granted);

  -- @students.local addresses can't receive mail → confirm immediately.
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;

  insert into public.user_profiles
    (user_id, display_name, avatar, email, username, full_name, role, updated_at)
  values
    (new.id, fname, '', mail, uname, fname, granted, now())
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        email        = excluded.email,
        username     = excluded.username,
        full_name    = excluded.full_name,
        role         = excluded.role,
        updated_at   = excluded.updated_at;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  before insert on auth.users
  for each row execute function public.handle_new_user();

-- New classes belong to the teacher who creates them (WelcomeModal only sends
-- code/title/admin_pin_hash/created_by, so we fill teacher_id here).
create or replace function public.set_class_owner()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.teacher_id is null then
    new.teacher_id := auth.uid();
  end if;
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists set_class_owner_on_insert on public.class_sessions;
create trigger set_class_owner_on_insert
  before insert on public.class_sessions
  for each row execute function public.set_class_owner();

-- ---------------------------------------------------------------------------
-- 5) Column-level grants on user_profiles
--    Users may edit their name/avatar — never their role, email or username.
-- ---------------------------------------------------------------------------
revoke all on table public.user_profiles from anon;
revoke update, insert on table public.user_profiles from authenticated;
grant  update (display_name, avatar, updated_at) on table public.user_profiles to authenticated;
grant  insert (user_id, display_name, avatar, updated_at) on table public.user_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Row Level Security policies (auth.uid() + role based)
-- ---------------------------------------------------------------------------
alter table public.class_sessions          enable row level security;
alter table public.teams                   enable row level security;
alter table public.team_members            enable row level security;
alter table public.cells                   enable row level security;
alter table public.comments                enable row level security;
alter table public.exercises               enable row level security;
alter table public.exercise_submissions    enable row level security;
alter table public.shared_exercises        enable row level security;
alter table public.quizzes                 enable row level security;
alter table public.quiz_answers            enable row level security;
alter table public.competitions            enable row level security;
alter table public.competition_submissions enable row level security;
alter table public.team_messages           enable row level security;
alter table public.user_profiles           enable row level security;

-- ===== class_sessions =====
-- everyone logged in can resolve a class by its code (that's how you join),
-- but only teachers create classes and only the owner manages them.
drop policy if exists class_sessions_select on public.class_sessions;
create policy class_sessions_select on public.class_sessions
  for select to authenticated using (true);

drop policy if exists class_sessions_insert on public.class_sessions;
create policy class_sessions_insert on public.class_sessions
  for insert to authenticated
  with check (public.is_teacher() and (teacher_id is null or teacher_id = auth.uid()));

drop policy if exists class_sessions_update on public.class_sessions;
create policy class_sessions_update on public.class_sessions
  for update to authenticated
  using (public.is_class_owner(id) or public.is_teacher());

drop policy if exists class_sessions_delete on public.class_sessions;
create policy class_sessions_delete on public.class_sessions
  for delete to authenticated
  using (public.is_class_owner(id) or public.is_teacher());

-- ===== teams =====
-- students may create/join teams; only teachers delete them.
drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams
  for select to authenticated using (true);

drop policy if exists teams_insert on public.teams;
create policy teams_insert on public.teams
  for insert to authenticated with check (auth.uid() is not null);

drop policy if exists teams_update on public.teams;
create policy teams_update on public.teams
  for update to authenticated
  using (public.is_teacher() or public.is_team_member(id));

drop policy if exists teams_delete on public.teams;
create policy teams_delete on public.teams
  for delete to authenticated using (public.is_teacher());

-- ===== team_members =====
-- the team picker and the ranking tables show every member's display name,
-- so read is open to authenticated users; writes are self-only (or teacher).
drop policy if exists team_members_select on public.team_members;
create policy team_members_select on public.team_members
  for select to authenticated using (auth.uid() is not null);

drop policy if exists team_members_insert on public.team_members;
create policy team_members_insert on public.team_members
  for insert to authenticated
  with check (user_id = auth.uid() or public.is_teacher());

drop policy if exists team_members_update on public.team_members;
create policy team_members_update on public.team_members
  for update to authenticated
  using (user_id = auth.uid() or public.is_teacher());

drop policy if exists team_members_delete on public.team_members;
create policy team_members_delete on public.team_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_teacher());

-- ===== cells =====
-- students only reach their own cells + their team's cells; teachers see all.
drop policy if exists cells_select on public.cells;
create policy cells_select on public.cells
  for select to authenticated using (public.can_read_cell(id));

drop policy if exists cells_insert on public.cells;
create policy cells_insert on public.cells
  for insert to authenticated with check (author_id = auth.uid());

drop policy if exists cells_update on public.cells;
create policy cells_update on public.cells
  for update to authenticated using (public.can_edit_cell(id));

drop policy if exists cells_delete on public.cells;
create policy cells_delete on public.cells
  for delete to authenticated
  using (author_id = auth.uid() or public.is_teacher());

-- ===== comments =====
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select to authenticated
  using (author_id = auth.uid() or public.can_read_cell(cell_id));

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert to authenticated
  with check (author_id = auth.uid() and public.can_read_cell(cell_id));

drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments
  for update to authenticated
  using (author_id = auth.uid() or public.is_teacher());

drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments
  for delete to authenticated
  using (author_id = auth.uid() or public.is_teacher());

-- ===== exercises =====
-- students read exercises, only teachers create/edit them.
drop policy if exists exercises_select on public.exercises;
create policy exercises_select on public.exercises
  for select to authenticated using (true);

drop policy if exists exercises_insert on public.exercises;
create policy exercises_insert on public.exercises
  for insert to authenticated with check (public.is_teacher());

drop policy if exists exercises_update on public.exercises;
create policy exercises_update on public.exercises
  for update to authenticated using (public.is_teacher());

drop policy if exists exercises_delete on public.exercises;
create policy exercises_delete on public.exercises
  for delete to authenticated using (public.is_teacher());

-- ===== exercise_submissions =====
-- a student owns their rows; teachers can read/correct everything.
drop policy if exists exercise_submissions_select on public.exercise_submissions;
create policy exercise_submissions_select on public.exercise_submissions
  for select to authenticated
  using (user_id = auth.uid() or public.is_teacher());

drop policy if exists exercise_submissions_insert on public.exercise_submissions;
create policy exercise_submissions_insert on public.exercise_submissions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists exercise_submissions_update on public.exercise_submissions;
create policy exercise_submissions_update on public.exercise_submissions
  for update to authenticated
  using (user_id = auth.uid() or public.is_teacher());

drop policy if exists exercise_submissions_delete on public.exercise_submissions;
create policy exercise_submissions_delete on public.exercise_submissions
  for delete to authenticated
  using (user_id = auth.uid() or public.is_teacher());

-- ===== shared_exercises (teacher library) =====
drop policy if exists shared_exercises_select on public.shared_exercises;
create policy shared_exercises_select on public.shared_exercises
  for select to authenticated using (true);

drop policy if exists shared_exercises_insert on public.shared_exercises;
create policy shared_exercises_insert on public.shared_exercises
  for insert to authenticated with check (public.is_teacher());

drop policy if exists shared_exercises_update on public.shared_exercises;
create policy shared_exercises_update on public.shared_exercises
  for update to authenticated using (public.is_teacher());

drop policy if exists shared_exercises_delete on public.shared_exercises;
create policy shared_exercises_delete on public.shared_exercises
  for delete to authenticated using (public.is_teacher());

-- ===== quizzes =====
-- drafts are teacher-only; students only see active/ended quizzes.
drop policy if exists quizzes_select on public.quizzes;
create policy quizzes_select on public.quizzes
  for select to authenticated
  using (public.is_teacher() or status <> 'draft');

drop policy if exists quizzes_insert on public.quizzes;
create policy quizzes_insert on public.quizzes
  for insert to authenticated with check (public.is_teacher());

drop policy if exists quizzes_update on public.quizzes;
create policy quizzes_update on public.quizzes
  for update to authenticated using (public.is_teacher());

drop policy if exists quizzes_delete on public.quizzes;
create policy quizzes_delete on public.quizzes
  for delete to authenticated using (public.is_teacher());

-- ===== quiz_answers =====
-- read stays open to logged-in users: the leaderboard/statistics screen
-- (QuizResultsView) aggregates every answer of the quiz.
drop policy if exists quiz_answers_select on public.quiz_answers;
create policy quiz_answers_select on public.quiz_answers
  for select to authenticated using (auth.uid() is not null);

drop policy if exists quiz_answers_insert on public.quiz_answers;
create policy quiz_answers_insert on public.quiz_answers
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists quiz_answers_update on public.quiz_answers;
create policy quiz_answers_update on public.quiz_answers
  for update to authenticated
  using (user_id = auth.uid() or public.is_teacher());

drop policy if exists quiz_answers_delete on public.quiz_answers;
create policy quiz_answers_delete on public.quiz_answers
  for delete to authenticated
  using (user_id = auth.uid() or public.is_teacher());

-- ===== competitions =====
drop policy if exists competitions_select on public.competitions;
create policy competitions_select on public.competitions
  for select to authenticated
  using (public.is_teacher() or status <> 'draft');

drop policy if exists competitions_insert on public.competitions;
create policy competitions_insert on public.competitions
  for insert to authenticated with check (public.is_teacher());

drop policy if exists competitions_update on public.competitions;
create policy competitions_update on public.competitions
  for update to authenticated using (public.is_teacher());

drop policy if exists competitions_delete on public.competitions;
create policy competitions_delete on public.competitions
  for delete to authenticated using (public.is_teacher());

-- ===== competition_submissions =====
-- read is open (CompetitionsModal shows how many teams submitted); writes belong
-- to the submitting team — upsert uses submitter_key, so a teammate may update
-- the team's existing row.
drop policy if exists competition_submissions_select on public.competition_submissions;
create policy competition_submissions_select on public.competition_submissions
  for select to authenticated using (auth.uid() is not null);

drop policy if exists competition_submissions_insert on public.competition_submissions;
create policy competition_submissions_insert on public.competition_submissions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (public.is_teacher() or (team_id is not null and public.is_team_member(team_id)))
  );

drop policy if exists competition_submissions_update on public.competition_submissions;
create policy competition_submissions_update on public.competition_submissions
  for update to authenticated
  using (
    public.is_teacher()
    or user_id = auth.uid()
    or (team_id is not null and public.is_team_member(team_id))
  );

drop policy if exists competition_submissions_delete on public.competition_submissions;
create policy competition_submissions_delete on public.competition_submissions
  for delete to authenticated
  using (user_id = auth.uid() or public.is_teacher());

-- ===== team_messages =====
drop policy if exists team_messages_select on public.team_messages;
create policy team_messages_select on public.team_messages
  for select to authenticated
  using (public.is_teacher() or public.is_team_member(team_id));

drop policy if exists team_messages_insert on public.team_messages;
create policy team_messages_insert on public.team_messages
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (public.is_teacher() or public.is_team_member(team_id))
  );

drop policy if exists team_messages_update on public.team_messages;
create policy team_messages_update on public.team_messages
  for update to authenticated using (user_id = auth.uid());

drop policy if exists team_messages_delete on public.team_messages;
create policy team_messages_delete on public.team_messages
  for delete to authenticated
  using (user_id = auth.uid() or public.is_teacher());

-- ===== user_profiles =====
-- read is open to logged-in users (avatars + names appear in cells, rankings and
-- the admin panel). Writes are self-only AND column-limited (section 5), so
-- role / email / username / full_name can never be edited from the client.
drop policy if exists user_profiles_select on public.user_profiles;
create policy user_profiles_select on public.user_profiles
  for select to authenticated using (true);

drop policy if exists user_profiles_insert on public.user_profiles;
create policy user_profiles_insert on public.user_profiles
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists user_profiles_update on public.user_profiles;
create policy user_profiles_update on public.user_profiles
  for update to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 7) No more anonymous access
-- ---------------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;

-- ---------------------------------------------------------------------------
-- 8) Delete the old anonymous users
--    Anonymous accounts are exactly the ones with no email, no phone and no
--    password. Their *content* (cells, comments, submissions, ...) is NOT
--    deleted — only the auth account goes away, so the class history survives.
--    ⚠️ Irreversible: take a backup first (Dashboard → Database → Backups).
-- ---------------------------------------------------------------------------

-- Preview first if you want to be sure (run this select on its own):
--   select id, created_at from auth.users
--   where email is null and phone is null and encrypted_password is null;

delete from auth.users
where email is null
  and phone is null
  and encrypted_password is null;

-- Legacy classes created by those anonymous users have teacher_id = null.
-- Hand them to the first real teacher so the class row stays manageable
-- (swap the subquery for a literal uuid for a 1:1 mapping):
--   update public.class_sessions set teacher_id = '<teacher-uuid>' where code = 'ABC123';
update public.class_sessions cs
set teacher_id = (
  select p.user_id from public.user_profiles p
  where p.role = 'teacher'
  order by p.updated_at
  limit 1
)
where cs.teacher_id is null
  and exists (select 1 from public.user_profiles p where p.role = 'teacher');

-- ---------------------------------------------------------------------------
-- 9) Sanity checks (just run them; they only read)
-- ---------------------------------------------------------------------------
-- teachers vs students:
--   select role, count(*) from public.user_profiles group by role;
-- anonymous accounts left:
--   select count(*) from auth.users where email is null and phone is null;
-- RLS enabled everywhere?
--   select tablename, rowsecurity from pg_tables where schemaname = 'public';
-- policies per table:
--   select tablename, count(*) from pg_policies where schemaname = 'public' group by tablename;





