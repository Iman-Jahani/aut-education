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
--   `select * from public.class_sessions` (id, code, title, admin_pin_hash,
--   created_by, teacher_id, created_at), so the helpers in
--   src/lib/classJoin.ts keep working unchanged.
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
