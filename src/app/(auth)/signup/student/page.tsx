"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ToastProvider";
import { AuthHeading, AuthSwitch, AUTH_INPUT } from "@/components/AuthShell";
import Icon from "@/components/Icon";

export default function StudentSignupPage() {
  const { signUpStudent } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    const err = await signUpStudent({ code, fullName, password });
    setBusy(false);
    if (err) return setError(err);
    toast(`خوش اومدی ${fullName.trim()}!`, "ok");
    router.replace("/");
  };

  return (
    <>
      <AuthHeading
        icon="cap"
        title="ثبت‌نام دانشجو"
        subtitle="کد دانشجویی‌ات رو بذار؛ زیر کاپوت یه ایمیل ساختگی برات ساخته می‌شه."
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
          <p className="text-[11px] text-muted mt-1">فقط حروف انگلیسی، عدد، نقطه و خط تیره</p>
        </div>

        <div>
          <label className="block text-xs font-bold mb-1.5 flex items-center gap-1.5">
            <Icon name="edit" className="w-3.5 h-3.5 text-primary" /> نام کامل
          </label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            placeholder="مثلاً: علی رضایی"
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
          {busy ? "در حال ساخت حساب…" : "ساخت حساب دانشجویی"}
        </button>
      </form>

      <AuthSwitch>
        <div>
          حساب داری؟{" "}
          <Link href="/login/student" className="text-primary font-bold hover:underline">
            ورود دانشجو
          </Link>
        </div>
        <div>
          معلمی؟{" "}
          <Link href="/signup/teacher" className="text-primary font-bold hover:underline">
            ثبت‌نام معلم
          </Link>
        </div>
      </AuthSwitch>
    </>
  );
}
