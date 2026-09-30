// Auth helpers shared by the auth pages, AuthProvider and middleware.
// Persian UI strings live next to the logic they belong to.

export type Role = "student" | "teacher";

/** Students sign up with a fake email built from their student code. */
export const STUDENT_EMAIL_DOMAIN = "students.local";

export function studentCodeToEmail(code: string): string {
  return `${code.trim().toLowerCase()}@${STUDENT_EMAIL_DOMAIN}`;
}

/** Reverse of studentCodeToEmail ("" when the email is not a student address). */
export function emailToStudentCode(email: string): string {
  const e = (email || "").trim().toLowerCase();
  const suffix = "@" + STUDENT_EMAIL_DOMAIN;
  return e.endsWith(suffix) ? e.slice(0, -suffix.length) : "";
}

export function isStudentEmail(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase().endsWith("@" + STUDENT_EMAIL_DOMAIN);
}

/** a-z, 0-9, dot, dash, underscore — 3..32 chars, must start alphanumeric. */
export function isValidStudentCode(code: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{2,31}$/i.test((code || "").trim());
}

export const PASSWORD_MIN_LENGTH = 6;

/** Persian digits for user-facing numbers (۶ instead of 6). */
export function faNum(n: number | string): string {
  const digits = "۰۱۲۳۴۵۶۷۸۹";
  return String(n).replace(/\d/g, (d) => digits[Number(d)]);
}

export function isStrongEnoughPassword(pw: string): boolean {
  return (pw || "").length >= PASSWORD_MIN_LENGTH;
}

type MetaLike = { user_metadata?: Record<string, unknown> | null; app_metadata?: Record<string, unknown> | null } | null;

/** Role detection: app_metadata is server-owned (trusted), user_metadata is the fallback. */
export function roleOf(user: MetaLike): Role | null {
  if (!user) return null;
  const trusted = user.app_metadata?.role;
  const claimed = user.user_metadata?.role;
  const raw = typeof trusted === "string" ? trusted : typeof claimed === "string" ? claimed : "";
  return raw === "teacher" || raw === "student" ? raw : null;
}

/**
 * Maps raw Supabase/Auth.js error messages to Persian copy for the forms.
 * `forStudent` switches the credential wording (student code vs email).
 */
export function persianAuthError(message: string | null | undefined, forStudent = false): string {
  const m = (message || "").toLowerCase();
  const badCreds = forStudent ? "کد دانشجویی یا رمز عبور اشتباهه" : "ایمیل یا رمز عبور اشتباهه";
  if (!m) return "خطای ناشناخته؛ دوباره تلاش کن";
  if (m.includes("invalid login credentials")) return badCreds;
  if (m.includes("already registered") || m.includes("already been registered")) return "این حساب قبلاً ثبت‌نام شده؛ وارد شو";
  if (m.includes("password should be at least") || m.includes("password is too short"))
    return `رمز عبور حداقل ${faNum(PASSWORD_MIN_LENGTH)} کاراکتره`;
  if (m.includes("email not confirmed")) return "ایمیل هنوز تأیید نشده؛ لینک تأیید رو چک کن";
  if (m.includes("user not found")) return forStudent ? "کد دانشجویی پیدا نشد" : "کاربری با این ایمیل پیدا نشد";
  if (m.includes("signup is disabled")) return "ثبت‌نام موقتاً بسته است";
  if (m.includes("rate limit") || m.includes("too many request")) return "تلاش زیاده؛ چند ثانیه بعد دوباره امتحان کن";
  if (m.includes("email address \"") && m.includes("is invalid")) return "ساختار ایمیل معتبر نیست";
  if (m.includes("invite")) return "کد دعوت معلم معتبر نیست";
  if (m.includes("row-level security") || m.includes("row level security"))
    return "دسترسی نداری؛ اگه فکر می‌کنی اشتباهه با معلمت تماس بگیر";
  return "خطا: " + message;
}
