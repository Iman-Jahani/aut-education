"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ToastProvider";
import { AuthHeading, AuthSwitch, AUTH_INPUT } from "@/components/AuthShell";
import Icon from "@/components/Icon";

export default function StudentLoginPage() {
  const { signInStudent } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    const err = await signInStudent(code, password);
    setBusy(false);
    if (err) return setError(err);
    toast("خوش اومدی!", "ok");
    router.replace("/");
  };

  return (
    <>
      <AuthHeading
        icon="users"
        title="ورود دانشجو"
        subtitle="با کد دانشجویی و رمز عبورت وارد شو؛ از هر دستگاهی همون حسابت."
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
            <Icon name="user" className="w-3.5 h-3.5 text-primary" /> کد دانشجویی
          </label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            dir="ltr"
            autoComplete="username"
            autoFocus
            placeholder="مثلاً: 401234567"
            className={AUTH_INPUT + " text-center tracking-widest font-bold"}
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
          {busy ? "در حال ورود…" : "ورود"}
        </button>
      </form>

      <AuthSwitch>
        <div>
          حساب نداری؟{" "}
          <Link href="/signup/student" className="text-primary font-bold hover:underline">
            ثبت‌نام دانشجویی
          </Link>
        </div>
        <div>
          معلمی؟{" "}
          <Link href="/login/teacher" className="text-primary font-bold hover:underline">
            ورود معلم
          </Link>
        </div>
      </AuthSwitch>
    </>
  );
}
