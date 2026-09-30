// Joining a class by its code always goes through the `join_class_by_code`
// RPC (see supabase/join_class_by_code.sql) instead of reading `class_sessions`
// straight from the client: the code lookup (and any membership bookkeeping)
// happens server-side, so RLS on the table can stay locked down.
import { supabase } from "@/lib/supabase";
import type { ClassSession } from "@/lib/types";

/**
 * Resolves a class from the code the user typed (or opened a link with).
 *
 * The RPC returns a set of rows — the same columns the old
 * `from("class_sessions").select("*").eq("code", code)` returned (id, code,
 * title, admin_pin_hash, …) — so `id`, `code` and `title` are always there
 * and `admin_pin_hash` is still available for the teacher mode restore.
 *
 * Throws a Persian error when the code is unknown or the RPC fails.
 */
export async function joinClassByCode(code: string): Promise<ClassSession> {
  const { data, error } = await supabase.rpc("join_class_by_code", {
    p_code: code.trim().toUpperCase(),
  });

  // data is an array — take the first record.
  const cls = (Array.isArray(data) ? data[0] : data) as ClassSession | null | undefined;
  if (error || !cls) {
    throw new Error("کلاس پیدا نشد یا خطا در عضویت");
  }

  return cls;
}
