-- Reference schema, reverse-engineered from the original app's Supabase calls.
-- Your Supabase project already has these tables — this file is just
-- documentation / a starting point if you ever need to recreate them
-- (e.g. in a fresh project) or add the tables for exercises/quizzes/
-- competitions that the old app also used (not yet ported to Next.js).

create table if not exists class_sessions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null,
  admin_pin_hash text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references class_sessions(id) on delete cascade,
  name text not null,
  color text not null,
  created_at timestamptz not null default now(),
  unique (class_id, name)
);

create table if not exists team_members (
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null,
  display_name text not null,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists cells (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references class_sessions(id) on delete cascade,
  team_id uuid references teams(id) on delete set null,
  team_name text,
  author_id uuid not null,
  author_name text not null,
  code text default '',
  output text default '',
  tags text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  cell_id uuid not null references cells(id) on delete cascade,
  author_id uuid not null,
  author_name text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists user_profiles (
  user_id uuid primary key,
  display_name text not null,
  avatar text not null,
  updated_at timestamptz not null default now()
);

create table if not exists shared_exercises (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  hint text,
  test_cases jsonb not null default '[]',
  created_by_name text,
  use_count int default 0,
  created_at timestamptz not null default now()
);

create table if not exists exercises (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references class_sessions(id) on delete cascade,
  title text not null,
  description text,
  hint text,
  test_cases jsonb not null default '[]',
  shared_exercise_id uuid references shared_exercises(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists exercise_submissions (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references exercises(id) on delete cascade,
  user_id uuid not null,
  author_name text not null,
  code text,
  output text,
  status text not null default 'pending',
  score int default 0,
  passed_tests int default 0,
  total_tests int default 0,
  test_results jsonb default '[]',
  submitted_at timestamptz not null default now(),
  unique (exercise_id, user_id)
);



create table if not exists quizzes (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references class_sessions(id) on delete cascade,
  title text not null,
  time_limit int not null default 5, -- minutes
  questions jsonb not null default '[]', -- [{question, options:[...], correct}]
  status text not null default 'draft', -- draft | active | ended
  started_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists quiz_answers (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  user_id uuid not null,
  author_name text not null,
  answers jsonb not null default '[]', -- [selectedOptionIndex, ...]
  score int not null default 0,
  total_questions int not null default 0,
  submitted_at timestamptz not null default now(),
  unique (quiz_id, user_id)
);

-- Enable realtime on quizzes so the active-quiz banner appears instantly:
-- alter publication supabase_realtime add table quizzes;

-- Enable realtime on cells so the workspace updates live:
-- alter publication supabase_realtime add table cells;

-- ===== Competitions =====
create table if not exists competitions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references class_sessions(id) on delete cascade,
  title text not null,
  description text,
  time_limit int not null default 10, -- minutes
  status text not null default 'draft', -- draft | active | ended
  started_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists competition_submissions (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  team_name text not null,
  user_id uuid not null,
  author_name text not null,
  code text,
  submitted_at timestamptz not null default now(),
  submitter_key text not null,
  unique (competition_id, submitter_key)
);

-- ===== Team chat (NEW in the Next.js version) =====
create table if not exists team_messages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  class_id uuid not null references class_sessions(id) on delete cascade,
  user_id uuid not null,
  author_name text not null,
  avatar text,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists team_messages_team_created_idx on team_messages (team_id, created_at);

-- RLS: keep the same open policy style as your other tables (adjust to taste), e.g.
-- alter table team_messages enable row level security;
-- create policy "team_messages_all" on team_messages for all using (true) with check (true);

-- Realtime for instant chat + competition banner:
-- alter publication supabase_realtime add table team_messages;
-- alter publication supabase_realtime add table competitions;

-- ===== Cell ordering (insert a cell between others) =====
alter table cells add column if not exists position double precision;
