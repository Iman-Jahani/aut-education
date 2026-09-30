-- ============================================================================
-- join_class_by_code.sql — resolve (and join) a class from its code server-side
--
-- WHY
--   The client used to read the class row directly:
--     supabase.from('class_sessions').select('*').eq('code', code).maybeSingle()
--   Now the code lookup happens server-side through this RPC:
--     supabase.rpc('join_class_by_code', { p_code: code })
--   The client then takes the first row of the returned set (data[0]).
--
-- HOW TO RUN
--   Supabase Dashboard → SQL Editor → paste this whole file → Run.
--   Idempotent (`create or replace`), so you can re-run it safely.
--
-- RETURNS
--   A set of 0 or 1 rows with the same columns as
--   `select * from public.class_sessions` — id, code, title, teacher_id,
--   admin_pin_hash, created_by, created_at — so the client can use
--   `data[0].id / .code / .title / .teacher_id` (plus admin_pin_hash for the
--   class "teacher mode") exactly like it did with the old direct read.
-- ============================================================================

create or replace function public.join_class_by_code(p_code text)
returns setof public.class_sessions
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
begin
  if v_code = '' then
    return;
  end if;

  return query
    select c.*
    from public.class_sessions c
    where c.code = v_code
    limit 1;

  -- If you keep a class-membership table, record the join here (the RPC runs
  -- as the definer, so it bypasses RLS). Example:
  --   insert into public.class_members (class_id, user_id)
  --   select c.id, auth.uid() from public.class_sessions c where c.code = v_code
  --   on conflict do nothing;
end;
$$;

-- Only signed-in users may resolve a class (anon lost access to the tables in
-- supabase/auth_migration.sql).
revoke all on function public.join_class_by_code(text) from public;
revoke all on function public.join_class_by_code(text) from anon;
grant execute on function public.join_class_by_code(text) to authenticated;

-- Handy check while testing:
--   select * from public.join_class_by_code('A1B2C3');

-- ---------------------------------------------------------------------------
-- VERIFY (paste each block in the SQL Editor)
--   -- 1) does the function exist, and can the app execute it?
--   select p.proname, pg_get_function_arguments(p.oid) as args, p.prosecdef, p.proacl
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'join_class_by_code';
--
--   -- 2) does it resolve the code? (must return exactly 1 row)
--   select id, code, title, teacher_id from public.join_class_by_code('A1B2C3');
--
--   -- 3) FORCE RLS would also bind the function owner and defeat
--   --    SECURITY DEFINER — relforcerowsecurity must be false:
--   select relrowsecurity, relforcerowsecurity
--   from pg_class where oid = 'public.class_sessions'::regclass;
--
--   -- 4) what can a student read from the table right now?
--   select polname, pg_get_expr(polqual, polrelid) as using_expr
--   from pg_policy where polrelid = 'public.class_sessions'::regclass;

-- ---------------------------------------------------------------------------
-- PLAN B — if you cannot deploy the RPC right now (or while debugging):
--   give signed-in users read access to the class row again, which is exactly
--   what the app did before. Uncomment, run once, and students can join again.
--   drop policy if exists class_sessions_select on public.class_sessions;
--   create policy class_sessions_select on public.class_sessions
--     for select to authenticated using (true);
