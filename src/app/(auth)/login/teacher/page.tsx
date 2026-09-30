"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ToastProvider";
import { AuthHeading, AuthSwitch, AUTH_INPUT } from "@/components/AuthShell";
import Icon from "@/components/Icon";

export default function TeacherLoginPage() {
  const { signInTeacher } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    const err = await signInTeacher(email, password);
    setBusy(false);
    if (err) return setError(err);
    toast("خوش اومدی استاد!", "ok");
    router.replace("/");
  };

  return (
    <>
      <AuthHeading
        icon="cap"
        title="ورود معلم"
        subtitle="با ایمیل و رمز عبورت وارد شو؛ دسترسی کامل به کلاس‌ها و پنل مدیریت."
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
            <Icon name="lock" className="w-3.5 h-3.5 text-primary" /> رمز عبور
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            dir="ltr"
            autoComplete="current-password"
            placeholder="رمز عبور"
            className={AUTH_INPUT}
          />
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
          <Icon name="logout" className="w-4 h-4" />
          {busy ? "در حال ورود…" : "ورود معلم"}
        </button>
      </form>

      <AuthSwitch>
        <div>
          حساب نداری؟{" "}
          <Link href="/signup/teacher" className="text-primary font-bold hover:underline">
            ثبت‌نام معلم
          </Link>
        </div>
        <div>
          دانشجو هستی؟{" "}
          <Link href="/login/student" className="text-primary font-bold hover:underline">
            ورود دانشجو
          </Link>
        </div>
      </AuthSwitch>
    </>
  );
}
