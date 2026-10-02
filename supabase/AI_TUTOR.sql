-- ============================================================
--  🤖 AI Tutor — Hint Requests
-- ============================================================

create table if not exists public.ai_hint_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  code text not null default '',
  user_message text,
  ai_response text not null,
  created_at timestamptz default now()
);

create index if not exists idx_ai_hint_user on public.ai_hint_requests(user_id);
create index if not exists idx_ai_hint_user_date on public.ai_hint_requests(user_id, created_at desc);
create index if not exists idx_ai_hint_exercise on public.ai_hint_requests(exercise_id);

alter table public.ai_hint_requests enable row level security;

-- هر کاربر فقط درخواست‌های خودش رو ببینه
drop policy if exists "ai_hint_select_own" on public.ai_hint_requests;
create policy "ai_hint_select_own" on public.ai_hint_requests
  for select using (user_id = auth.uid());

-- هر کاربر فقط برای خودش insert کنه
drop policy if exists "ai_hint_insert_own" on public.ai_hint_requests;
create policy "ai_hint_insert_own" on public.ai_hint_requests
  for insert with check (user_id = auth.uid());

-- معلم‌ها بتونن درخواست‌های کلاس‌های خودشون رو ببینن (برای نظارت)
drop policy if exists "ai_hint_teacher_select" on public.ai_hint_requests;
create policy "ai_hint_teacher_select" on public.ai_hint_requests
  for select using (
    exists (
      select 1 from public.class_sessions cs
      join public.exercises ex on ex.class_id = cs.id
      where ex.id = ai_hint_requests.exercise_id
        and cs.teacher_id = auth.uid()
    )
  );

-- تابع کمکی: تعداد درخواست‌های ۲۴ ساعت اخیر
create or replace function public.count_ai_hints_today(p_user_id uuid)
returns int
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
  from public.ai_hint_requests
  where user_id = p_user_id
    and created_at >= (now() - interval '24 hours');
$$;

grant execute on function public.count_ai_hints_today(uuid) to authenticated;

-- تابع کمکی: آخرین درخواست کاربر
create or replace function public.last_ai_hint_at(p_user_id uuid)
returns timestamptz
language sql
security definer
set search_path = public
stable
as $$
  select max(created_at)
  from public.ai_hint_requests
  where user_id = p_user_id;
$$;

grant execute on function public.last_ai_hint_at(uuid) to authenticated;
