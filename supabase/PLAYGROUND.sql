-- ============================================================================
-- PLAYGROUND.sql — «کدنویسی آزاد» بدون عضویت در هیچ کلاس
--
-- چرا؟
--   دانشجو باید بتواند بدون این‌که عضو هیچ کلاسی باشد کد بنویسد و از
--   قابلیت‌های سایت (اجرای پایتون با Pyodide، ذخیره‌ی خودکار، برچسب، خروجی ipynb)
--   استفاده کند. این‌جا دفترچه‌های شخصی هر کاربر ذخیره می‌شوند — کاملاً جدا از
--   جدول‌های کلاس (cells/class_sessions).
--
-- چه کاری انجام می‌دهد؟
--   1) public.user_notebooks       → دفترچه‌های شخصی کاربر (چند تا)
--   2) public.user_notebook_cells  → سلول‌های هر دفترچه
--   3) RLS: هر کاربر فقط ردیف‌های خودش را می‌بیند و می‌نویسد (user_id = auth.uid())
--
-- چگونه اجرا کنم؟
--   Supabase Dashboard → SQL Editor → این فایل را کامل paste کن → Run.
--   idempotent است.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) دفترچه‌های شخصی
-- ---------------------------------------------------------------------------
create table if not exists public.user_notebooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'دفترچه من',
  position double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists user_notebooks_user_idx
  on public.user_notebooks (user_id, position);

-- ---------------------------------------------------------------------------
-- 2) سلول‌های دفترچه‌ی شخصی
-- ---------------------------------------------------------------------------
create table if not exists public.user_notebook_cells (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references public.user_notebooks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  code text default '',
  output text default '',
  tags text[] default '{}',
  position double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists user_notebook_cells_notebook_idx
  on public.user_notebook_cells (notebook_id, position);

-- ---------------------------------------------------------------------------
-- 3) RLS — فقط مالک
-- ---------------------------------------------------------------------------
alter table public.user_notebooks enable row level security;
alter table public.user_notebook_cells enable row level security;

drop policy if exists user_notebooks_all on public.user_notebooks;
create policy user_notebooks_all on public.user_notebooks
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists user_notebook_cells_all on public.user_notebook_cells;
create policy user_notebook_cells_all on public.user_notebook_cells
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Realtime لازم نیست (پلی‌گراند فقط برای خود کاربر است). در صورت تمایل:
-- alter publication supabase_realtime add table public.user_notebook_cells;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- بررسی سریع
--   select * from public.user_notebooks order by created_at desc;
--   select * from public.user_notebook_cells order by notebook_id, position;
-- ---------------------------------------------------------------------------
