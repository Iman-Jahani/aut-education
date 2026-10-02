-- ============================================================
--  ⚔️ Code Battle — 1v1  (supabase/BATTLE.sql)
--
--  HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run (idempotent).
-- ============================================================

-- جدول نبردها
create table if not exists public.battles (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.class_sessions(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null,
  host_id uuid not null references auth.users(id) on delete cascade,
  guest_id uuid references auth.users(id) on delete set null,
  room_code text not null unique,
  status text not null default 'waiting'
    check (status in ('waiting', 'ready', 'active', 'finished', 'cancelled')),
  time_limit int not null default 300,        -- seconds
  host_ready boolean not null default false,
  guest_ready boolean not null default false,
  host_last_ping timestamptz,
  guest_last_ping timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  winner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_battles_room on public.battles(room_code);
create index if not exists idx_battles_class on public.battles(class_id);
create index if not exists idx_battles_status on public.battles(status);
create index if not exists idx_battles_host on public.battles(host_id);
create index if not exists idx_battles_guest on public.battles(guest_id);

-- صف انتظار برای Quick Match
create table if not exists public.battle_queue (
  user_id uuid primary key references auth.users(id) on delete cascade,
  class_id uuid not null references public.class_sessions(id) on delete cascade,
  joined_at timestamptz default now()
);

create index if not exists idx_battle_queue_class on public.battle_queue(class_id);

-- ارسال‌های هر بازیکن
create table if not exists public.battle_submissions (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references public.battles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null default '',
  passed_tests int not null default 0,
  total_tests int not null default 0,
  test_results jsonb default '[]'::jsonb,
  is_final boolean not null default false,
  submitted_at timestamptz default now(),
  unique (battle_id, user_id)
);

create index if not exists idx_battle_subs_battle on public.battle_submissions(battle_id);

-- RLS
alter table public.battles enable row level security;
alter table public.battle_queue enable row level security;
alter table public.battle_submissions enable row level security;

-- battles: host، guest، یا معلم کلاس
drop policy if exists "battles_select" on public.battles;
create policy "battles_select" on public.battles
  for select using (
    host_id = auth.uid()
    or guest_id = auth.uid()
    or exists (
      select 1 from public.class_sessions cs
      where cs.id = battles.class_id and cs.teacher_id = auth.uid()
    )
  );

drop policy if exists "battles_insert" on public.battles;
create policy "battles_insert" on public.battles
  for insert with check (host_id = auth.uid());

drop policy if exists "battles_update" on public.battles;
create policy "battles_update" on public.battles
  for update using (host_id = auth.uid() or guest_id = auth.uid());

-- battle_queue: همه اعضای کلاس ببینن (برای پیدا کردن حریف)
drop policy if exists "battle_queue_select" on public.battle_queue;
create policy "battle_queue_select" on public.battle_queue
  for select using (true);

drop policy if exists "battle_queue_insert" on public.battle_queue;
create policy "battle_queue_insert" on public.battle_queue
  for insert with check (user_id = auth.uid());

drop policy if exists "battle_queue_delete" on public.battle_queue;
create policy "battle_queue_delete" on public.battle_queue
  for delete using (user_id = auth.uid());

-- battle_submissions
drop policy if exists "battle_subs_select" on public.battle_submissions;
create policy "battle_subs_select" on public.battle_submissions
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.battles b
      where b.id = battle_submissions.battle_id
        and (b.host_id = auth.uid() or b.guest_id = auth.uid())
    )
  );

drop policy if exists "battle_subs_upsert" on public.battle_submissions;
create policy "battle_subs_upsert" on public.battle_submissions
  for insert with check (user_id = auth.uid());

drop policy if exists "battle_subs_update" on public.battle_submissions;
create policy "battle_subs_update" on public.battle_submissions
  for update using (user_id = auth.uid());


-- ============================================================
--  توابع
-- ============================================================

-- کد اتاق ۶ رقمی یکتا
create or replace function public.generate_room_code()
returns text
language plpgsql
as $$
declare
  v_code text;
  v_exists boolean;
begin
  loop
    v_code := upper(substr(md5(random()::text), 1, 6));
    select exists(select 1 from public.battles where room_code = v_code) into v_exists;
    if not v_exists then
      return v_code;
    end if;
  end loop;
end;
$$;

-- پیدا کردن حریف از صف (نبرد سریع).
-- NOTE: برخلاف نسخه‌ی اولیه، یک تمرین تصادفی از همان کلاس هم انتخاب می‌شود،
-- وگرنه نبرد بدون تمرین ساخته می‌شد و میدان نبرد خالی می‌ماند.
create or replace function public.find_quick_match(p_class_id uuid)
returns table (battle_id uuid, room_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opponent_id uuid;
  v_battle_id uuid;
  v_room_code text;
  v_exercise_id uuid;
begin
  delete from public.battle_queue
  where class_id = p_class_id
    and joined_at < (now() - interval '2 minutes');

  select user_id into v_opponent_id
  from public.battle_queue
  where class_id = p_class_id
    and user_id != auth.uid()
  order by joined_at asc
  limit 1;

  if v_opponent_id is null then
    insert into public.battle_queue (user_id, class_id)
    values (auth.uid(), p_class_id)
    on conflict (user_id) do update set joined_at = now();
    return;
  end if;

  select e.id into v_exercise_id
  from public.exercises e
  where e.class_id = p_class_id
  order by random()
  limit 1;

  v_room_code := public.generate_room_code();

  insert into public.battles (
    class_id, exercise_id, host_id, guest_id, room_code, status, time_limit,
    host_ready, guest_ready, started_at
  ) values (
    p_class_id, v_exercise_id, v_opponent_id, auth.uid(), v_room_code, 'active', 300,
    true, true, now()
  )
  returning id into v_battle_id;

  delete from public.battle_queue where user_id in (v_opponent_id, auth.uid());

  return query select v_battle_id, v_room_code;
end;
$$;

grant execute on function public.find_quick_match(uuid) to authenticated;

-- آمار و XP هر بازیکن (صفحه‌ی پایان نبرد): ۵۰×برد + ۲۰×مساوی + ۱۰×هر نبرد
create or replace function public.battle_stats(p_user_id uuid)
returns table (played int, wins int, losses int, draws int, xp int)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select b.winner_id
    from public.battles b
    where (b.host_id = p_user_id or b.guest_id = p_user_id)
      and b.status = 'finished'
  )
  select
    count(*)::int as played,
    count(*) filter (where winner_id = p_user_id)::int as wins,
    count(*) filter (where winner_id is not null and winner_id <> p_user_id)::int as losses,
    count(*) filter (where winner_id is null)::int as draws,
    (count(*) filter (where winner_id = p_user_id) * 50
      + count(*) filter (where winner_id is null) * 20
      + count(*) * 10)::int as xp
  from mine;
$$;

grant execute on function public.battle_stats(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- پیوستن به اتاق با کد.
-- لازم است چون RLS اجازه نمی‌دهد یک بازیکن *قبل* از عضویت، ردیف نبرد را ببیند؛
-- این تابع با security definer این کار را اتمی انجام می‌دهد و قوانین را چک می‌کند:
--   • اتاق باید waiting/ready و بدون مهمان باشد
--   • نمی‌شود به اتاق خودت پیوست
--   • با همان حریف، حداقل ۱ ساعت بین دو نبرد (قانون rematch cooldown)
-- خروجی: battle_id و در صورت خطا، متن فارسی در ستون error.
create or replace function public.join_battle_by_code(p_room_code text)
returns table (battle_id uuid, error text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_battle public.battles;
  v_code text := upper(trim(coalesce(p_room_code, '')));
  v_recent boolean;
begin
  select * into v_battle from public.battles b where b.room_code = v_code limit 1;

  if v_battle.id is null then
    return query select null::uuid, 'اتاقی با این کد پیدا نشد.';
    return;
  end if;

  if v_battle.status not in ('waiting', 'ready') then
    return query select null::uuid, 'این نبرد شروع شده یا تمام شده.';
    return;
  end if;

  if v_battle.host_id = auth.uid() then
    return query select null::uuid, 'نمی‌تونی به اتاق خودت بپیوندی.';
    return;
  end if;

  if v_battle.guest_id is not null and v_battle.guest_id <> auth.uid() then
    return query select null::uuid, 'این اتاق پر شده.';
    return;
  end if;

  -- ۱ ساعت فاصله با همان حریف
  select exists (
    select 1 from public.battles b
    where b.status = 'finished'
      and b.finished_at > (now() - interval '1 hour')
      and ((b.host_id = v_battle.host_id and b.guest_id = auth.uid())
        or (b.host_id = auth.uid() and b.guest_id = v_battle.host_id))
  ) into v_recent;

  if v_recent then
    return query select null::uuid, 'با این حریف تا یک ساعت دیگه نمی‌تونی نبرد کنی.';
    return;
  end if;

  update public.battles
  set guest_id = auth.uid(),
      guest_ready = false,
      status = 'ready',
      guest_last_ping = now()
  where id = v_battle.id;

  return query select v_battle.id, null::text;
end;
$$;

grant execute on function public.join_battle_by_code(text) to authenticated;

