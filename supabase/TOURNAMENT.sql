-- ============================================================================
--  🏆 Tournament System  (supabase/TOURNAMENT.sql)
--
--  کنار سیستم «1v1 آزاد» (supabase/BATTLE.sql) کار می‌کند و به آن دست نمی‌زند:
--    • 1v1 آزاد → جدول‌های battles / battle_queue / battle_submissions + سوال از exercises
--    • تورنمنت  → جدول‌های این فایل + سوال از بانک battle_questions
--
--  HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run (idempotent).
--
--  ⚠️ تفاوت با طرح اولیه (لازم بود، توضیح کامل در README):
--     جدول `class_members` در این پروژه وجود ندارد (لیست کلاس‌های هر دانشجو در
--     مرورگر نگه داشته می‌شود)، پس در سیاست‌ها به‌جای آن از `public.is_teacher()`
--     و «شرکت‌کننده‌ی همان تورنمنت» استفاده شده است.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ۱) بانک سوال مسابقه (منبع سوالِ تورنمنت — جدا از exercises)
-- ---------------------------------------------------------------------------
create table if not exists public.battle_questions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.class_sessions(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text default '',
  hint text default '',
  difficulty text not null default 'medium'
    check (difficulty in ('easy', 'medium', 'hard')),
  test_cases jsonb default '[]'::jsonb,
  tags jsonb default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_bq_class on public.battle_questions(class_id);
create index if not exists idx_bq_teacher on public.battle_questions(teacher_id);
create index if not exists idx_bq_difficulty on public.battle_questions(difficulty);

-- ---------------------------------------------------------------------------
-- ۲) تورنمنت‌ها
-- ---------------------------------------------------------------------------
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.class_sessions(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text default '',
  time_limit int not null default 300,
  max_participants int not null default 8
    check (max_participants in (8, 16, 32, 64)),
  is_group_stage boolean not null default false,
  group_size int default 8 check (group_size in (6, 8, 10)),
  groups_count int,
  question_mode text not null default 'random'
    check (question_mode in ('random', 'difficulty_based', 'fixed')),
  fixed_question_id uuid references public.battle_questions(id) on delete set null,
  status text not null default 'registering'
    check (status in ('registering', 'active', 'finished', 'cancelled')),
  current_round int not null default 0,
  current_stage text default 'group'
    check (current_stage in ('group', 'knockout')),
  winner_id uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_tournaments_class on public.tournaments(class_id);
create index if not exists idx_tournaments_status on public.tournaments(status);
create index if not exists idx_tournaments_teacher on public.tournaments(teacher_id);

-- ---------------------------------------------------------------------------
-- ۳) شرکت‌کننده‌ها
-- ---------------------------------------------------------------------------
create table if not exists public.tournament_participants (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  group_number int,
  eliminated_at_round int,
  eliminated_at_stage text,
  joined_at timestamptz default now(),
  unique (tournament_id, user_id)
);

create index if not exists idx_tp_tournament on public.tournament_participants(tournament_id);
create index if not exists idx_tp_user on public.tournament_participants(user_id);

-- ---------------------------------------------------------------------------
-- ۴) نبردهای تورنمنت (جدول جدا — جدولِ 1v1 آزاد دست‌نخورده می‌ماند)
-- ---------------------------------------------------------------------------
create table if not exists public.tournament_battles (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.class_sessions(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  stage text not null default 'knockout'
    check (stage in ('group', 'knockout')),
  group_number int,
  round_number int not null,
  bracket_position int not null,
  battle_question_id uuid not null references public.battle_questions(id) on delete cascade,
  host_id uuid not null references auth.users(id) on delete cascade,
  guest_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'finished', 'cancelled')),
  time_limit int not null default 300,
  started_at timestamptz default now(),
  finished_at timestamptz,
  winner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_tb_tournament on public.tournament_battles(tournament_id);
create index if not exists idx_tb_round on public.tournament_battles(tournament_id, stage, group_number, round_number);
create index if not exists idx_tb_status on public.tournament_battles(status);
create index if not exists idx_tb_host on public.tournament_battles(host_id);
create index if not exists idx_tb_guest on public.tournament_battles(guest_id);

-- ---------------------------------------------------------------------------
-- ۵) ارسال‌های نبردهای تورنمنت
-- ---------------------------------------------------------------------------
create table if not exists public.tournament_battle_submissions (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references public.tournament_battles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null default '',
  passed_tests int not null default 0,
  total_tests int not null default 0,
  test_results jsonb default '[]'::jsonb,
  is_final boolean not null default false,
  submitted_at timestamptz default now(),
  unique (battle_id, user_id)
);

create index if not exists idx_tbs_battle on public.tournament_battle_submissions(battle_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.battle_questions enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_participants enable row level security;
alter table public.tournament_battles enable row level security;
alter table public.tournament_battle_submissions enable row level security;

-- بانک سوال: مالک سوال + معلم‌ها + بازیکنانی که نبردی با این سوال دارند
-- (کلاس عضویتش اینجا نمی‌آید چون class_members در این پروژه وجود ندارد)
drop policy if exists "bq_select" on public.battle_questions;
create policy "bq_select" on public.battle_questions
  for select to authenticated using (
    teacher_id = auth.uid()
    or public.is_teacher()
    or exists (
      select 1 from public.tournament_battles tb
      where tb.battle_question_id = battle_questions.id
        and (tb.host_id = auth.uid() or tb.guest_id = auth.uid())
    )
  );

drop policy if exists "bq_insert" on public.battle_questions;
create policy "bq_insert" on public.battle_questions
  for insert to authenticated with check (teacher_id = auth.uid());

drop policy if exists "bq_update" on public.battle_questions;
create policy "bq_update" on public.battle_questions
  for update to authenticated using (teacher_id = auth.uid());

drop policy if exists "bq_delete" on public.battle_questions;
create policy "bq_delete" on public.battle_questions
  for delete to authenticated using (teacher_id = auth.uid());

-- تورنمنت‌ها: نمایش برای همه‌ی کاربرانِ واردشده (مثل class_sessions در این پروژه؛
-- رابط کاربری لیست را بر اساس کلاس‌های خود فیلتر می‌کند)، نوشتن فقط معلم.
drop policy if exists "tournaments_select" on public.tournaments;
create policy "tournaments_select" on public.tournaments
  for select to authenticated using (true);

drop policy if exists "tournaments_insert" on public.tournaments;
create policy "tournaments_insert" on public.tournaments
  for insert to authenticated with check (teacher_id = auth.uid());

drop policy if exists "tournaments_update" on public.tournaments;
create policy "tournaments_update" on public.tournaments
  for update to authenticated using (teacher_id = auth.uid());

drop policy if exists "tournaments_delete" on public.tournaments;
create policy "tournaments_delete" on public.tournaments
  for delete to authenticated using (teacher_id = auth.uid());

-- شرکت‌کنندگان: همه ببینند (ساخت براکت)، ثبت/حذف فقط خودت؛ حذفِ دیگری = معلم مربوط
drop policy if exists "tp_select" on public.tournament_participants;
create policy "tp_select" on public.tournament_participants for select using (true);

drop policy if exists "tp_insert" on public.tournament_participants;
create policy "tp_insert" on public.tournament_participants
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "tp_delete" on public.tournament_participants;
create policy "tp_delete" on public.tournament_participants
  for delete to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.tournaments t
      where t.id = tournament_participants.tournament_id and t.teacher_id = auth.uid()
    )
  );

-- نبردهای تورنمنت: دو بازیکن + معلم کلاس + هر شرکتکنندگانِ همان تورنمنت
-- (شرکتکننده هم باید براکت را ببیند — افزوده به طرح اولیه)
drop policy if exists "tb_select" on public.tournament_battles;
create policy "tb_select" on public.tournament_battles
  for select to authenticated using (
    host_id = auth.uid()
    or guest_id = auth.uid()
    or public.is_class_owner(class_id)
    or public.is_teacher()
    or exists (
      select 1 from public.tournament_participants tp
      where tp.tournament_id = tournament_battles.tournament_id and tp.user_id = auth.uid()
    )
  );

drop policy if exists "tb_update" on public.tournament_battles;
create policy "tb_update" on public.tournament_battles
  for update to authenticated using (host_id = auth.uid() or guest_id = auth.uid());

-- ارسال‌ها: خودت / حریفت / معلم کلاس
drop policy if exists "tbs_select" on public.tournament_battle_submissions;
create policy "tbs_select" on public.tournament_battle_submissions
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.tournament_battles b
      where b.id = tournament_battle_submissions.battle_id
        and (b.host_id = auth.uid() or b.guest_id = auth.uid())
    )
    or public.is_teacher()
  );

drop policy if exists "tbs_insert" on public.tournament_battle_submissions;
create policy "tbs_insert" on public.tournament_battle_submissions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "tbs_update" on public.tournament_battle_submissions;
create policy "tbs_update" on public.tournament_battle_submissions
  for update to authenticated using (user_id = auth.uid());

-- ===========================================================================
-- توابع
-- ===========================================================================

-- انتخاب سوال برای یک نوبت (random | difficulty_based | fixed)
create or replace function public.pick_tournament_question(
  p_tournament_id uuid, p_round int, p_stage text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_t record;
  v_question_id uuid;
  v_difficulty text;
begin
  select * into v_t from public.tournaments where id = p_tournament_id;
  if v_t is null then raise exception 'تورنمنت پیدا نشد'; end if;

  if v_t.question_mode = 'fixed' and v_t.fixed_question_id is not null then
    return v_t.fixed_question_id;
  end if;

  if v_t.question_mode = 'difficulty_based' then
    if p_round <= 1 then v_difficulty := 'easy';
    elsif p_round <= 2 then v_difficulty := 'medium';
    else v_difficulty := 'hard';
    end if;

    select id into v_question_id
    from public.battle_questions
    where class_id = v_t.class_id and is_active = true and difficulty = v_difficulty
    order by random() limit 1;

    if v_question_id is null then
      select id into v_question_id
      from public.battle_questions
      where class_id = v_t.class_id and is_active = true
      order by random() limit 1;
    end if;

    if v_question_id is null then raise exception 'هیچ سوالی توی بانک نیست'; end if;
    return v_question_id;
  end if;

  select id into v_question_id
  from public.battle_questions
  where class_id = v_t.class_id and is_active = true
  order by random() limit 1;

  if v_question_id is null then raise exception 'بانک سوال خالیه'; end if;
  return v_question_id;
end;
$$;

grant execute on function public.pick_tournament_question(uuid, int, text) to authenticated;

-- ثبت‌نام دانشجو در تورنمنت (چک ظرفیت و وضعیت، بدون race condition)
create or replace function public.register_for_tournament(p_tournament_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_t record;
  v_count int;
begin
  select * into v_t from public.tournaments where id = p_tournament_id;
  if v_t is null then return 'تورنمنت پیدا نشد'; end if;
  if v_t.status <> 'registering' then return 'ثبت‌نام بسته شده'; end if;

  select count(*) into v_count
  from public.tournament_participants where tournament_id = p_tournament_id;

  if v_count >= v_t.max_participants then
    return 'ظرفیت تورنمنت پر است';
  end if;

  insert into public.tournament_participants (tournament_id, user_id)
  values (p_tournament_id, auth.uid())
  on conflict (tournament_id, user_id) do nothing;

  return null;
end;
$$;

grant execute on function public.register_for_tournament(uuid) to authenticated;

-- انصراف دانشجو (فقط قبل از شروع)
create or replace function public.unregister_from_tournament(p_tournament_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_t record;
begin
  select * into v_t from public.tournaments where id = p_tournament_id;
  if v_t is null then return 'تورنمنت پیدا نشد'; end if;
  if v_t.status <> 'registering' then return 'تورنمنت شروع شده؛ انصراف ممکن نیست'; end if;

  delete from public.tournament_participants
  where tournament_id = p_tournament_id and user_id = auth.uid();

  return null;
end;
$$;

grant execute on function public.unregister_from_tournament(uuid) to authenticated;

-- شروع تورنمنت: تصادفی‌سازی شرکتکنندگان + ساخت دور اول
-- (با مرحله‌ی گروهی یا حذفی سریع — دقیقاً مطابق طرح، فقط با یکسان‌سازی تصادفی)
create or replace function public.start_tournament(p_tournament_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_t record;
  v_participants uuid[];
  v_count int;
  v_i int;
  v_host_id uuid;
  v_guest_id uuid;
  v_question_id uuid;
  v_group_count int;
  v_per_group int;
  v_group_idx int;
  v_group_participants uuid[];
begin
  select * into v_t from public.tournaments
  where id = p_tournament_id and teacher_id = auth.uid();

  if v_t is null then raise exception 'دسترسی نداری'; end if;
  if v_t.status != 'registering' then raise exception 'قابل شروع نیست'; end if;

  if not exists (
    select 1 from public.battle_questions
    where class_id = v_t.class_id and is_active = true
  ) then
    raise exception 'بانک سوال خالیه';
  end if;

  select array_agg(user_id order by random()) into v_participants
  from public.tournament_participants where tournament_id = p_tournament_id;

  v_count := array_length(v_participants, 1);
  if v_count is null or v_count < 2 then raise exception 'حداقل ۲ نفر'; end if;

  v_question_id := public.pick_tournament_question(p_tournament_id, 1, 'group');

  -- ---------- حذفی سریع (بدون مرحله گروهی) ----------
  if not v_t.is_group_stage then
    if v_count % 2 = 1 then
      v_participants := array_append(v_participants, null);
      v_count := v_count + 1;
    end if;

    v_i := 1;
    while v_i < v_count loop
      v_host_id := v_participants[v_i];
      v_guest_id := v_participants[v_i + 1];
      if v_host_id is not null and v_guest_id is not null then
        insert into public.tournament_battles (
          class_id, tournament_id, stage, round_number, bracket_position,
          battle_question_id, host_id, guest_id, status, time_limit
        ) values (
          v_t.class_id, p_tournament_id, 'knockout', 1, (v_i / 2) + 1,
          v_question_id, v_host_id, v_guest_id, 'active', v_t.time_limit
        );
      end if;
      v_i := v_i + 2;
    end loop;

    update public.tournaments
    set status = 'active', current_round = 1, current_stage = 'knockout', started_at = now()
    where id = p_tournament_id;
    return;
  end if;

  -- ---------- مرحله گروهی ----------
  v_per_group := v_t.group_size;
  v_group_count := ceil(v_count::numeric / v_per_group)::int;

  update public.tournaments
  set groups_count = v_group_count, status = 'active', current_round = 1,
      current_stage = 'group', started_at = now()
  where id = p_tournament_id;

  for v_group_idx in 1..v_group_count loop
    v_group_participants := array[]::uuid[];
    for v_i in 1..v_per_group loop
      if coalesce(array_length(v_participants, 1), 0) > 0 then
        v_group_participants := array_append(v_group_participants, v_participants[1]);
        v_participants := v_participants[2:];
      end if;
    end loop;

    update public.tournament_participants
    set group_number = v_group_idx
    where tournament_id = p_tournament_id and user_id = any(v_group_participants);

    if array_length(v_group_participants, 1) % 2 = 1 then
      v_group_participants := array_append(v_group_participants, null);
    end if;

    v_i := 1;
    while v_i < array_length(v_group_participants, 1) + 1 loop
      v_host_id := v_group_participants[v_i];
      v_guest_id := v_group_participants[v_i + 1];
      if v_host_id is not null and v_guest_id is not null then
        insert into public.tournament_battles (
          class_id, tournament_id, stage, group_number, round_number, bracket_position,
          battle_question_id, host_id, guest_id, status, time_limit
        ) values (
          v_t.class_id, p_tournament_id, 'group', v_group_idx, 1, (v_i / 2) + 1,
          v_question_id, v_host_id, v_guest_id, 'active', v_t.time_limit
        );
      end if;
      v_i := v_i + 2;
    end loop;
  end loop;
end;
$$;

grant execute on function public.start_tournament(uuid) to authenticated;

-- پیشبرد تورنمنت: بعد از تمام شدن همه‌ی نبردهای نوبت جاری، بازنده‌ها را حذف
-- و نوبت بعد را می‌سازد.
--
-- تفاوت مهم با نسخه‌ی اولیه: جفت‌بندی از «بازیکنان زنده» محاسبه می‌شود، نه از
-- فهرست برنده‌ها. در نسخه‌ی قبل وقتی تعداد فرد بود، بازیکنی که «بای‌» می‌گرفت
-- از جدول حذف (network) خارج می‌شد و بی‌صدا حذف می‌شد؛ حالا بازیکن بدون نبرد
-- زنده می‌ماند و در نوبت بعد شرکت می‌کند.
create or replace function public.advance_tournament(p_tournament_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_t record;
  v_round int;
  v_unfinished int;
  v_g int;
  v_i int;
  v_count int;
  v_question_id uuid;
  v_host uuid;
  v_guest uuid;
  v_winner uuid;
  v_loser uuid;
  v_group_alive uuid[];
  v_group_survivors uuid[];
begin
  select * into v_t from public.tournaments where id = p_tournament_id;
  if v_t is null or v_t.status != 'active' then return; end if;

  -- فقط معلمِ تورنمنت یا یکی از شرکت‌کنندگان
  if v_t.teacher_id <> auth.uid()
     and not exists (
       select 1 from public.tournament_participants p
       where p.tournament_id = v_t.id and p.user_id = auth.uid()
     ) then
    raise exception 'دسترسی نداری';
  end if;

  v_round := v_t.current_round;

  -- ۱) هنوز نبردی از نوبت جاری تمام نشده → صبر
  select count(*) into v_unfinished
  from public.tournament_battles
  where tournament_id = p_tournament_id
    and stage = v_t.current_stage
    and round_number = v_round
    and status = 'active';

  if v_unfinished > 0 then return; end if;

  -- ۲) بازنده‌های هر نبردِ تمام‌شده‌ی این نوبت را حذف کن
  for v_host, v_guest, v_winner in
    select host_id, guest_id, winner_id
    from public.tournament_battles
    where tournament_id = p_tournament_id
      and stage = v_t.current_stage
      and round_number = v_round
      and status = 'finished'
  loop
    if v_winner is null then
      continue; -- بدون برنده مشخص → کسی حذف نمی‌شود (باید در API هرگز پیش نیاید)
    elsif v_winner = v_host then
      v_loser := v_guest;
    elsif v_winner = v_guest then
      v_loser := v_host;
    else
      continue;
    end if;

    update public.tournament_participants
    set eliminated_at_round = v_round, eliminated_at_stage = v_t.current_stage
    where tournament_id = p_tournament_id
      and user_id = v_loser
      and eliminated_at_round is null;
  end loop;

  -- ================= مرحله گروهی =================
  if v_t.current_stage = 'group' then
    -- ۳) برای هر گروه، زنده‌ها را برای نوبت بعد جفت کن (فرد → بای)
    for v_g in 1..coalesce(v_t.groups_count, 0) loop
      select array_agg(user_id order by joined_at) into v_group_alive
      from public.tournament_participants
      where tournament_id = p_tournament_id
        and group_number = v_g
        and eliminated_at_round is null;

      v_count := coalesce(array_length(v_group_alive, 1), 0);

      if v_count >= 2 then
        v_question_id := public.pick_tournament_question(p_tournament_id, v_round + 1, 'group');
        if v_count % 2 = 1 then
          v_group_alive := array_append(v_group_alive, null);
        end if;

        v_i := 1;
        while v_i <= array_length(v_group_alive, 1) - 1 loop
          v_host := v_group_alive[v_i];
          v_guest := v_group_alive[v_i + 1];
          if v_host is not null and v_guest is not null then
            insert into public.tournament_battles (
              class_id, tournament_id, stage, group_number, round_number, bracket_position,
              battle_question_id, host_id, guest_id, status, time_limit
            ) values (
              v_t.class_id, p_tournament_id, 'group', v_g, v_round + 1, ((v_i + 1) / 2),
              v_question_id, v_host, v_guest, 'active', v_t.time_limit
            );
          end if;
          v_i := v_i + 2;
        end loop;
      end if;
    end loop;

    -- ۴) اگر نبرد گروهی فعالی ماند → نوبت بعد؛ وگرنه مرحله حذفی شروع می‌شود
    select count(*) into v_unfinished
    from public.tournament_battles
    where tournament_id = p_tournament_id and stage = 'group' and status = 'active';

    if v_unfinished > 0 then
      update public.tournaments set current_round = v_round + 1 where id = p_tournament_id;
      return;
    end if;

    -- هر گروهی که به یک نفر رسیده (زنده‌ی تنها) وارد حذفی می‌شود
    select array_agg(user_id order by group_number) into v_group_survivors
    from public.tournament_participants p
    where p.tournament_id = p_tournament_id
      and p.eliminated_at_round is null
      and p.group_number is not null
      and (
        select count(*) from public.tournament_participants q
        where q.tournament_id = p.tournament_id
          and q.group_number = p.group_number
          and q.eliminated_at_round is null
      ) = 1;

    v_count := coalesce(array_length(v_group_survivors, 1), 0);
    if v_count = 0 then
      return; -- گروهی هنوز تمام نشده؛ دفعه بعد دوباره تلاش می‌شود
    end if;

    v_question_id := public.pick_tournament_question(p_tournament_id, 1, 'knockout');
    if v_count % 2 = 1 then
      v_group_survivors := array_append(v_group_survivors, null);
    end if;

    v_i := 1;
    while v_i <= array_length(v_group_survivors, 1) - 1 loop
      v_host := v_group_survivors[v_i];
      v_guest := v_group_survivors[v_i + 1];
      if v_host is not null and v_guest is not null then
        insert into public.tournament_battles (
          class_id, tournament_id, stage, round_number, bracket_position,
          battle_question_id, host_id, guest_id, status, time_limit
        ) values (
          v_t.class_id, p_tournament_id, 'knockout', 1, ((v_i + 1) / 2),
          v_question_id, v_host, v_guest, 'active', v_t.time_limit
        );
      end if;
      v_i := v_i + 2;
    end loop;

    update public.tournaments
    set current_stage = 'knockout', current_round = 1
    where id = p_tournament_id;
    return;
  end if;

  -- ================= مرحله حذفی =================
  -- زنده‌ها = شرکتکنندگانی که هنوز حذف نشده‌اند (بای در دور قبل هم زنده است)
  select array_agg(user_id order by joined_at) into v_group_alive
  from public.tournament_participants
  where tournament_id = p_tournament_id and eliminated_at_round is null;

  v_count := coalesce(array_length(v_group_alive, 1), 0);

  if v_count <= 1 then
    update public.tournaments
    set status = 'finished',
        winner_id = case when v_count = 1 then v_group_alive[1] else null end,
        finished_at = now()
    where id = p_tournament_id;
    return;
  end if;

  v_question_id := public.pick_tournament_question(p_tournament_id, v_round + 1, 'knockout');
  if v_count % 2 = 1 then
    v_group_alive := array_append(v_group_alive, null);
  end if;

  v_i := 1;
  while v_i <= array_length(v_group_alive, 1) - 1 loop
    v_host := v_group_alive[v_i];
    v_guest := v_group_alive[v_i + 1];
    if v_host is not null and v_guest is not null then
      insert into public.tournament_battles (
        class_id, tournament_id, stage, round_number, bracket_position,
        battle_question_id, host_id, guest_id, status, time_limit
      ) values (
        v_t.class_id, p_tournament_id, 'knockout', v_round + 1, ((v_i + 1) / 2),
        v_question_id, v_host, v_guest, 'active', v_t.time_limit
      );
    end if;
    v_i := v_i + 2;
  end loop;

  update public.tournaments set current_round = v_round + 1 where id = p_tournament_id;
end;
$$;

grant execute on function public.advance_tournament(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- بررسی پس از اجرا:
--   select count(*) from public.battle_questions;                 -- باید صفر یا بیشتر باشد
--   select id, title, status from public.tournaments order by created_at desc limit 5;
--   select count(*) from public.tournament_participants;
-- ---------------------------------------------------------------------------
