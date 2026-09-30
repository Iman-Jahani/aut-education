# مهاجرت به Auth واقعی (دانشجو / معلم)

دیگر خبری از **anonymous auth** نیست: هر کاربر با کد دانشجویی (یا ایمیل معلم) و رمز عبور وارد می‌شود و همان حساب روی هر دستگاهی برمی‌گردد.

## ۱) چه چیزی در کد تغییر کرد

| مسیر | کار |
| --- | --- |
| `src/lib/auth.ts` | `studentCodeToEmail()`، `isValidStudentCode()`، `roleOf()`، مترجم خطاهای Supabase به فارسی |
| `src/lib/supabase.ts` | کلاینت مرورگر با `createBrowserClient` (کوکی) تا middleware هم بتواند session را بخواند |
| `src/context/AuthContext.tsx` | بدون anonymous؛ `role`، `isTeacher`، `signInStudent/signUpStudent/signInTeacher/signUpTeacher/signOut`؛ نام و آواتار از `user_profiles` (هم‌سان در همه دستگاه‌ها) |
| `src/middleware.ts` | محافظت مسیرها: مهمان → `/`، دانشجو → `/class/*`، معلم → همه‌چیز + `/admin` |
| `src/app/(auth)/**` | چهار صفحه‌ی ورود/ثبت‌نام (دانشجو و معلم) |
| `src/app/page.tsx` | صفحه‌ی الانتخاب نقش: «ورود دانشجو» و «ورود معلم»؛ بعد از ورود دکمه‌ی «ورود به کلاس» |
| `src/components/WelcomeModal.tsx` | تب «ساخت کلاس جدید» فقط برای معلم نمایش داده می‌شود |
| `src/lib/classJoin.ts` | `joinClassByCode(code)` — ورود به کلاس فقط از طریق RPC `join_class_by_code` (بدون خواندن مستقیم `class_sessions`) |
| `supabase/auth_migration.sql` | ستون‌ها، کدهای دعوت، تریگر ثبت‌نام، توابع کمکی، RLS کامل، حذف anon |
| `supabase/join_class_by_code.sql` | تابع RPCِ `join_class_by_code(p_code)` — پیدا/عضویت کلاس با کد، سمت سرور |

نگاشت کد دانشجویی به ایمیل:

```ts
studentCodeToEmail("401234567") // → "401234567@students.local"
```

## ۲) اجرای SQL

1. از دیتابیس بکاپ بگیر (Dashboard → Database → Backups).
2. `supabase/auth_migration.sql` را کامل در **SQL Editor** اجرا کن (تکرارپذیر است).
3. `supabase/join_class_by_code.sql` را هم در **SQL Editor** اجرا کن؛ بدون این تابع،
   «پیوستن به کلاس با کد» و باز کردن لینک کلاس کار نمی‌کند (کلاینت به‌جای خواندن
   مستقیم `class_sessions`، این RPC را صدا می‌زند).
4. کد دعوت پیش‌فرض `PY-TEACHER-2025` ساخته می‌شود. عوضش کن یا کد جدید بساز:

```sql
insert into public.teacher_invites (code, note) values ('KELAS-1404', 'دعوت همکاران');
update public.teacher_invites set active = false where code = 'PY-TEACHER-2025';
```

5. برای ارتقای یک حساب به معلم (بدون کد دعوت):

```sql
update public.user_profiles set role = 'teacher' where email = 'teacher@school.edu';
-- نکته: پس از تغییر، کاربر باید دوباره وارد شود تا نقش در توکن/JWT تازه شود.
```

## ۳) تنظیمات داشبورد Supabase

* **Auth → Providers → Anonymous sign-ins**: خاموش (دیگر استفاده نمی‌شود).
* **Auth → Providers → Email**: «Confirm email» می‌تواند روشن یا خاموش باشد — تریگر، ایمیل‌های `@students.local` را خودکار تأیید می‌کند. اگر روشن است و ایمیل واقعی معلم نیاز به تأیید دارد، لینک تأیید برایش ارسال می‌شود.
* **Auth → URL Configuration**: نیازی به Redirect URL نیست (ایمیل تأیید برای دانشجو ارسال نمی‌شود).

## ۴) مدل امنیت (خلاصه‌ی RLS)

| موضوع | قاعده |
| --- | --- |
| نقش معلم | فقط با **کد دعوت معتبر** در تریگر سرور تعیین می‌شود؛ دانشجو نمی‌تواند `role: teacher` را از کلاینت جعل کند |
| `user_profiles` | کاربر فقط `display_name`, `avatar`, `updated_at` را می‌تواند عوض کند (`GRANT` ستونی)؛ `role`, `email`, `username`, `full_name` قفل است |
| `cells` | خواندن/ویرایش: نویسنده، هم‌تیمی‌ها، معلم‌ها. حذف: نویسنده یا معلم |
| `comments` | روی سلول‌هایی که می‌بیند؛ ویرایش/حذف خودش یا معلم |
| `quizzes` / `competitions` | پیش‌نویس‌ها فقط برای معلم؛ ساخت/ویرایش/حذف فقط معلم |
| `quiz_answers` / `competition_submissions` | خواندن برای رتبه‌بندی و آمار باز است، ولی نوشتن فقط ردیف خود کاربر / تیم خودش |
| `team_members`, `teams` | خواندن باز (نام اعضا در انتخاب تیم و رتبه‌بندی)، نوشتن: خود کاربر / معلم |
| `team_messages` | فقط اعضای تیم (و معلم) |
| `class_sessions` | ساخت کلاس فقط معلم؛ مالکیت با `teacher_id` (تریگر آن را از `auth.uid()` پر می‌کند) |
| `anon` | دسترسی همه‌ی جدول‌ها از نقش `anon` گرفته شده |

## ۵) پاک‌سازی کاربران قدیمی

بخش ۸ فایل SQL حساب‌های anonymous را حذف می‌کند (کندیشن: بدون ایمیل، بدون تلفن، بدون رمز). محتوای کلاس‌ها (سلول‌ها، کامنت‌ها، تمرین‌ها…) پاک نمی‌شود؛ فقط حساب صاحبشان حذف می‌شود. برای بررسی قبل از حذف:

```sql
select id, created_at from auth.users
where email is null and phone is null and encrypted_password is null;
```

## ۶) تست دستی

1. `/` → دکمه‌های «ورود دانشجو» و «ورود معلم» را باید ببینی.
2. `/signup/student` با کد `test01` و رمز `123456` → باید وارد شود و به `/` برگردد (نام و نقش «دانشجو» بالای صفحه).
3. `/admin` با حساب دانشجو → ریدایرکت به `/`؛ با حساب معلم → فرم رمز پنل مدیریت.
4. کارهای قبلی: ساخت سلول، چت تیم، تمرین، کوییز، مسابقه، آپلود/دانلود ipynb (همه با RLS جدید باید مثل قبل کار کنند).
