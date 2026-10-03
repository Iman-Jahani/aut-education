-- ============================================================================
-- LESSONS.sql — «جلسه»ها به‌عنوان زیرواحدِ هر کلاس
--
-- چرا؟
--   قبلاً هر کلاس فقط یک صفحه‌ی تخت داشت و همه‌ی سلول‌ها (یعنی محتوای همه‌ی
--   جلسه‌ها) پشت‌سرهم روی همان صفحه می‌آمدند. حالا هر کلاس چند «جلسه» دارد و
--   سلول‌ها به جلسه وصل می‌شوند تا صفحه‌ی کلاس فقط یک جلسه را نشان دهد.
--
-- چه کاری انجام می‌دهد؟
--   1) جدول public.lessons می‌سازد (id, class_id, title, position, is_published, ...)
--   2) ستون cells.lesson_id را اضافه می‌کند (nullable → سازگار با داده‌ی قبلی)
--   3) برای هر کلاسِ موجود که سلولِ بی‌جلسه دارد، یک جلسه‌ی پیش‌فرض می‌سازد و
--      سلول‌هایش را به آن وصل می‌کند (هیچ داده‌ای گم نمی‌شود)
--   4) RLS به سبک supabase/auth_migration.sql
--
-- چگونه اجرا کنم؟
--   Supabase Dashboard → SQL Editor → این فایل را کامل paste کن → Run.
--   idempotent است؛ اجرای دوباره بی‌خطر است.
--
-- پیش‌نیاز: توابع public.is_teacher() و public.is_class_owner() از
--   supabase/auth_migration.sql تعریف شده باشند (این پروژه از قبل به آن نیاز دارد).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) جدول جلسه‌ها
-- ---------------------------------------------------------------------------
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.class_sessions (id) on delete cascade,
  title text not null,
  description text,
  -- ترتیب نمایش؛ بین دو جلسه مقدار میانی می‌گذاریم (مثل position سلول‌ها)
  position double precision,
  -- معلم می‌تواند جلسه‌ی در دست نوشتن را برای دانشجوها پنهان کند
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists lessons_class_position_idx
  on public.lessons (class_id, position);

-- ---------------------------------------------------------------------------
-- 2) اتصال سلول‌ها به جلسه
-- ---------------------------------------------------------------------------
alter table public.cells
  add column if not exists lesson_id uuid references public.lessons (id) on delete cascade;

create index if not exists cells_lesson_id_idx on public.cells (lesson_id);

-- ---------------------------------------------------------------------------
-- 3) Backfill: کلاس‌های قدیمی یک جلسه‌ی پیش‌فرض می‌گیرند
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_lesson uuid;
begin
  for r in select id from public.class_sessions loop
    -- فقط اگر سلولِ بی‌جلسه وجود دارد
    if exists (select 1 from public.cells c where c.class_id = r.id and c.lesson_id is null) then
      if not exists (select 1 from public.lessons l where l.class_id = r.id) then
        insert into public.lessons (class_id, title, position)
        values (r.id, 'جلسه ۱', 1000)
        returning id into v_lesson;
      else
        select l.id into v_lesson
        from public.lessons l
        where l.class_id = r.id
        order by l.position nulls last, l.created_at
        limit 1;
      end if;

      update public.cells
        set lesson_id = v_lesson
        where class_id = r.id and lesson_id is null;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4) RLS
--    خواندن: هر کاربرِ واردشده (برای نوار جلسه‌ها لازم است)
--    نوشتن: صاحب کلاس یا معلم
-- ---------------------------------------------------------------------------
alter table public.lessons enable row level security;

drop policy if exists lessons_select on public.lessons;
create policy lessons_select on public.lessons
  for select to authenticated using (true);

drop policy if exists lessons_insert on public.lessons;
create policy lessons_insert on public.lessons
  for insert to authenticated
  with check (public.is_class_owner(class_id) or public.is_teacher());

drop policy if exists lessons_update on public.lessons;
create policy lessons_update on public.lessons
  for update to authenticated
  using (public.is_class_owner(class_id) or public.is_teacher());

drop policy if exists lessons_delete on public.lessons;
create policy lessons_delete on public.lessons
  for delete to authenticated
  using (public.is_class_owner(class_id) or public.is_teacher());

-- PostgREST schema cache را تازه کن تا خطای PGRST205 نگیریم
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- بررسی سریع
--   select id, class_id, title, position, is_published from public.lessons order by class_id, position;
--   select lesson_id, count(*) from public.cells group by lesson_id;
-- ---------------------------------------------------------------------------
