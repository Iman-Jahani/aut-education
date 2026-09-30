"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ToastProvider";
import { AuthHeading, AuthSwitch, AUTH_INPUT } from "@/components/AuthShell";
import Icon from "@/components/Icon";

export default function TeacherSignupPage() {
  const { signUpTeacher } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    const err = await signUpTeacher({ email, fullName, password, inviteCode: invite });
    setBusy(false);
    if (err) return setError(err);
    toast(`خوش اومدی ${fullName.trim()}!`, "ok");
    router.replace("/");
  };

  return (
    <>
      <AuthHeading
        icon="school"
        title="ثبت‌نام معلم"
        subtitle="ایمیل واقعی، نام کامل و کد دعوت معلم؛ با حساب معلم کلاس می‌سازی."
      />

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-3"
      >
        <div>
          <label className="block text-xs font-bold mb-1.5 flex items-center gap-1.5">
            <Icon name="message" className="w-3.5 h-3.5 text-primary" /> ایمیل
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            dir="ltr"
            autoComplete="email"
            autoFocus
            placeholder="you@school.edu"
            className={AUTH_INPUT}
          />
        </div>

        <div>
          <label className="block text-xs font-bold mb-1.5 flex items-center gap-1.5">
            <Icon name="edit" className="w-3.5 h-3.5 text-primary" /> نام کامل
          </label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            placeholder="مثلاً: سارا محمدی"
            className={AUTH_INPUT}
          />
        </div>

        <div>
          <label className="block text-xs font-bold mb-1.5 flex items-center gap-1.5">
            <Icon name="lock" className="w-3.5 h-3.5 text-primary" /> رمز عبور
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            dir="ltr"
            autoComplete="new-password"
            placeholder="حداقل ۶ کاراکتر"
            className={AUTH_INPUT}
          />
        </div>

        <div>
          <label className="block text-xs font-bold mb-1.5 flex items-center gap-1.5">
            <Icon name="share" className="w-3.5 h-3.5 text-primary" /> کد دعوت معلم
          </label>
          <input
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            dir="ltr"
            autoComplete="off"
            placeholder="مثلاً: PY-TEACHER-2025"
            className={AUTH_INPUT + " tracking-widest font-bold"}
          />
          <p className="text-[11px] text-muted mt-1">
            کد دعوت فقط از طرف مدیر سیستم صادر می‌شود (در جدول <code dir="ltr">teacher_invites</code>)
          </p>
        </div>

        {error && (
          <p className="text-xs font-bold text-danger bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="btn-primary w-full !py-3 inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Icon name="check" className="w-4 h-4" />
          {busy ? "در حال ساخت حساب…" : "ساخت حساب معلم"}
        </button>
      </form>

      <AuthSwitch>
        <div>
          حساب داری؟{" "}
          <Link href="/login/teacher" className="text-primary font-bold hover:underline">
            ورود معلم
          </Link>
        </div>
        <div>
          دانشجو هستی؟{" "}
          <Link href="/signup/student" className="text-primary font-bold hover:underline">
            ثبت‌نام دانشجویی
          </Link>
        </div>
      </AuthSwitch>
    </>
  );
}
