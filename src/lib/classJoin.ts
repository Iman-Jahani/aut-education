// Joining a class by its code always goes through the `join_class_by_code`
// RPC (see supabase/join_class_by_code.sql) instead of reading `class_sessions`
// straight from the client: the code lookup (and any membership bookkeeping)
// happens server-side, so RLS on the table can stay locked down.
import { supabase } from "@/lib/supabase";
import type { ClassSession } from "@/lib/types";

/**
 * Resolves a class from the code the user typed (or opened a link with).
 *
 * The RPC returns a set of rows: `id`, `code` and `title` are what the caller
 * needs (`teacher_id` is there too). `admin_pin_hash` is used when the RPC
 * returns it, otherwise it is read on demand — see getClassAdminPinHash — so a
 * reduced column set does not break the class "teacher mode".
 *
 * Throws a Persian error: a distinct, explicit one when the RPC itself is
 * missing or not granted, and "کلاس با این کد پیدا نشد" otherwise.
 */
export async function joinClassByCode(code: string): Promise<ClassSession> {
  const { data, error } = await supabase.rpc("join_class_by_code", {
    // The DB function normalises too (upper + trim), so a typed code and the
    // one in /class/<CODE> both resolve whatever the casing is.
    p_code: code.trim().toUpperCase(),
  });

  // data is an array — take the first record.
  const cls = (Array.isArray(data) ? data[0] : data) as ClassSession | null | undefined;
  if (error || !cls) {
    throw new Error(joinErrorMessage(error));
  }

  return cls;
}

/**
 * The PIN hash may be missing when the RPC returns a reduced column set
 * (id/code/title/teacher_id). Read it on demand: RLS lets the class owner (or
 * a teacher) see it, while a student gets null — which is exactly the intent.
 * Returns null when it cannot be read, so teacher mode simply stays locked.
 */
export async function getClassAdminPinHash(cls: {
  id: string;
  admin_pin_hash?: string | null;
}): Promise<string | null> {
  if (cls.admin_pin_hash) return cls.admin_pin_hash;
  const { data } = await supabase
    .from("class_sessions")
    .select("admin_pin_hash")
    .eq("id", cls.id)
    .maybeSingle();
  return data?.admin_pin_hash ?? null;
}

/**
 * Turns a PostgREST/Supabase error into something the student can act on:
 * "the RPC isn't deployed" and "you have no EXECUTE grant" are NOT the same
 * as "that class code doesn't exist", and saying so makes the failure obvious.
 */
function joinErrorMessage(error: { message?: string; code?: string } | null): string {
  const msg = error?.message || "";
  if (error?.code === "PGRST202" || /could not find the function|schema cache|does not exist/i.test(msg)) {
    return "تابع join_class_by_code روی دیتابیس تعریف نشده — فایل supabase/join_class_by_code.sql را اجرا کن";
  }
  if (error?.code === "42501" || /permission denied/i.test(msg)) {
    return "اجازه‌ی صدا زدن تابع ورود به کلاس را نداری (grant execute روی join_class_by_code)";
  }
  if (error?.code === "PGRST301" || /jwt|not authenticated|no authorization/i.test(msg)) {
    return "اول وارد حساب شو، بعد کد کلاس را وارد کن";
  }
  return "کلاس با این کد پیدا نشد";
}

