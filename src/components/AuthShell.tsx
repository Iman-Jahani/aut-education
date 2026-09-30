"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Icon, { type IconName } from "@/components/Icon";

/** Shared shell for /login/* and /signup/* (RTL, Persian, same design tokens). */
export default function AuthShell({ children }: { children: React.ReactNode }) {
  const { ready, user } = useAuth();
  const router = useRouter();

  // Already logged in → no reason to sit on a login form.
  useEffect(() => {
    if (ready && user) router.replace("/");
  }, [ready, user, router]);

  if (ready && user) return null;

  return (
    <div className="min-h-screen grid place-items-center px-4 py-10 relative overflow-hidden">
      <div className="absolute -top-16 -right-20 w-80 h-80 rounded-full bg-primary2/20 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 -left-20 w-72 h-72 rounded-full bg-pink-400/15 blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm relative anim-pop">
        <Link href="/" className="flex items-center justify-center gap-2.5 mb-5 group">
          <span
            className="w-9 h-9 rounded-xl grid place-items-center text-white shadow-glow"
            style={{ background: "var(--grad)" }}
          >
            <Icon name="terminal" className="w-5 h-5" />
          </span>
          <span className="font-extrabold text-ink group-hover:text-primary transition">
            دفترچه کلاس پایتون
          </span>
        </Link>

        <div className="card p-6 sm:p-7">{children}</div>

        <p className="text-center text-xs text-muted mt-4">
          با ورود، قوانین کلاس رو می‌پذیری ·{" "}
          <Link href="/" className="text-primary font-bold hover:underline">
            بازگشت به صفحه اصلی
          </Link>
        </p>
      </div>
    </div>
  );
}

/** Icon + title + subtitle shown at the top of every auth card. */
export function AuthHeading({
  icon,
  title,
  subtitle,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="text-center mb-5">
      <span
        className="w-12 h-12 mx-auto rounded-2xl grid place-items-center text-white shadow-glow mb-3"
        style={{ background: "var(--grad)" }}
      >
        <Icon name={icon} className="w-6 h-6" />
      </span>
      <h1 className="font-extrabold text-lg">{title}</h1>
      <p className="text-xs text-muted mt-1 leading-6">{subtitle}</p>
    </div>
  );
}

export const AUTH_INPUT =
  "w-full border border-line rounded-xl px-4 py-3 text-sm outline-none focus:border-primary bg-white";

/** Bottom switcher between login/signup (and between the two roles). */
export function AuthSwitch({ children }: { children: React.ReactNode }) {
  return <div className="text-center text-xs text-muted mt-4 space-y-1">{children}</div>;
}
