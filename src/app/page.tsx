"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ToastProvider";
import ProfileModal from "@/components/ProfileModal";
import WelcomeModal from "@/components/WelcomeModal";
import Icon from "@/components/Icon";
import { listJoinedClasses, type JoinedClass } from "@/lib/joinedClasses";

export default function LandingPage() {
  const { ready, user, role, needsProfile, displayName, avatar, signOut } = useAuth();
  const toast = useToast();
  const [profileOpen, setProfileOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  const isTeacher = role === "teacher";

  // Recent classes come from localStorage, so they are read after mount
  // (during SSR localStorage does not exist — this avoids a hydration mismatch).
  const [recents, setRecents] = useState<JoinedClass[]>([]);
  useEffect(() => {
    if (user) setRecents(listJoinedClasses().slice(0, 4));
    else setRecents([]);
  }, [user]);

  // NOTE: the profile editor is never opened automatically — the user opens it
  // from the avatar button (which is highlighted while `needsProfile`).

  // Logged-in users go straight to "join / create class".
  function openClassPicker() {
    if (!user) return;
    setWelcomeOpen(true);
  }

  async function handleSignOut() {
    await signOut();
    toast("از حسابت خارج شدی", "info");
  }

  return (
    <div className="min-h-screen overflow-x-hidden">
      <nav className="sticky top-0 z-50 glass px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <span className="font-extrabold text-ink flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl grid place-items-center text-white shadow-glow" style={{ background: "var(--grad)" }}>
              <Icon name="terminal" className="w-5 h-5" />
            </span>
            دفترچه کلاس پایتون
          </span>
          <div className="flex-1" />
          {user ? (
            <>
              <Link href="/dashboard" className="btn-ghost hidden sm:inline-flex">
                <Icon name="chart" className="w-4 h-4" /> داشبورد من
              </Link>
              <Link href="/playground" className="btn-ghost hidden sm:inline-flex">
                <Icon name="terminal" className="w-4 h-4" /> تمرین آزاد
              </Link>
              {isTeacher && (
                <Link href="/admin" className="btn-ghost hidden sm:inline-flex">
                  پنل مدیریت
                </Link>
              )}
              <button
                onClick={() => setProfileOpen(true)}
                title={needsProfile ? "نام و آواتارت را تنظیم کن" : "پروفایل"}
                className={`flex items-center gap-2 pl-3 pr-1.5 py-1 bg-white border rounded-full text-sm font-bold text-primary hover:shadow-soft transition ${
                  needsProfile ? "border-primary/40 ring-2 ring-primary/25" : "border-line"
                }`}
              >
                <span className="w-7 h-7 rounded-full bg-indigo-50 grid place-items-center text-base">{avatar}</span>
                <span className="hidden sm:inline">{displayName}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-muted">
                  {needsProfile ? "نامت را تنظیم کن" : isTeacher ? "معلم" : "دانشجو"}
                </span>
              </button>
              <button onClick={handleSignOut} className="btn-ghost" title="خروج از حساب">
                <Icon name="logout" className="w-4 h-4" />
              </button>
            </>
          ) : (
            <a href="#choose" className="btn-ghost">
              <Icon name="logout" className="w-4 h-4" /> ورود
            </a>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="relative px-6 pt-16 pb-20 max-w-5xl mx-auto">
        <div className="absolute -top-10 -right-24 w-80 h-80 rounded-full bg-primary2/20 blur-3xl pointer-events-none" />
        <div className="absolute top-40 -left-24 w-72 h-72 rounded-full bg-pink-400/15 blur-3xl pointer-events-none" />
        <div className="relative grid md:grid-cols-2 gap-14 items-center">
          <div className="anim-pop">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white border border-primary/20 text-primary rounded-full text-xs font-bold mb-5 shadow-soft">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              زنده، تیمی و همزمان
            </span>
            <h1 className="text-4xl md:text-5xl font-extrabold leading-[1.3] tracking-tight mb-5">
              کلاس پایتونت رو <span className="grad-text">زنده و تعاملی</span> کن
            </h1>
            <p className="text-muted leading-8 max-w-md mb-8">
              دانشجوها در تیم کد می‌نویسن، همون لحظه اجرا می‌کنن، با هم چت می‌کنن و توی کوییز و مسابقه‌ی زنده رقابت می‌کنن؛ همه‌چیز توی مرورگر، بدون نصب.
            </p>
            {/* ===== Role choice (logged out) / class actions (logged in) ===== */}
            <div id="choose" className="space-y-3 max-w-md">
              {!ready ? (
                <div className="h-[132px] rounded-2xl skeleton" />
              ) : user ? (
                <>
                  <div className="card p-4 flex items-center gap-3">
                    <span className="w-11 h-11 rounded-xl bg-indigo-50 grid place-items-center text-xl shrink-0">
                      {avatar}
                    </span>
                    <div className="min-w-0">
                      <div className="font-extrabold text-sm truncate">خوش اومدی {displayName}</div>
                      <div className="text-[11px] text-muted">{isTeacher ? "حساب معلم" : "حساب دانشجویی"}</div>
                    </div>
                    <button
                      onClick={() => setProfileOpen(true)}
                      className="mr-auto btn-ghost !px-3 !py-1.5 !text-xs shrink-0"
                      title="ویرایش نام و آواتار"
                    >
                      <Icon name="edit" className="w-3.5 h-3.5" /> ویرایش
                    </button>
                  </div>

                  {needsProfile && (
                    <button
                      onClick={() => setProfileOpen(true)}
                      className="w-full card p-3 flex items-center gap-2 text-right border-primary/30 hover:shadow-soft transition"
                    >
                      <Icon name="sparkles" className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-xs font-bold">قبل از شروع، اسم و آواتارت را تنظیم کن</span>
                      <Icon name="arrowLeft" className="w-4 h-4 text-primary mr-auto" />
                    </button>
                  )}

                  {recents.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {recents.map((c) => (
                        <Link
                          key={c.id}
                          href={`/class/${c.code}`}
                          title="ادامه‌ی کلاس"
                          className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-white border border-line hover:border-primary/40 hover:text-primary transition"
                        >
                          <Icon name="school" className="w-3.5 h-3.5" />
                          <span className="max-w-[140px] truncate">{c.title}</span>
                          <span className="font-mono tracking-widest text-muted">{c.code}</span>
                        </Link>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={openClassPicker}
                      className="btn-primary !px-6 !py-3.5 !text-[15px] inline-flex items-center gap-2"
                    >
                      <Icon name="grid" className="w-5 h-5" /> ورود به کلاس
                    </button>
                    <Link href="/playground" className="btn-ghost !px-6 !py-3.5 inline-flex items-center gap-2">
                      <Icon name="terminal" className="w-4 h-4" /> تمرین آزاد
                    </Link>
                    <Link href="/dashboard" className="btn-ghost !px-6 !py-3.5 inline-flex items-center gap-2">
                      <Icon name="chart" className="w-4 h-4" /> داشبورد من
                    </Link>
                    <Link href="/battle" className="btn-ghost !px-6 !py-3.5 inline-flex items-center gap-2">
                      <Icon name="zap" className="w-4 h-4" /> ⚔️ نبرد
                    </Link>
                    {isTeacher && (
                      <Link href="/admin" className="btn-ghost !px-6 !py-3.5 inline-flex items-center gap-2">
                        <Icon name="settings" className="w-4 h-4" /> پنل مدیریت
                      </Link>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Link
                      href="/login/student"
                      className="card p-4 hover:shadow-lift hover:-translate-y-0.5 transition group"
                    >
                      <span
                        className="w-10 h-10 rounded-xl grid place-items-center text-white mb-2.5"
                        style={{ background: "var(--grad)" }}
                      >
                        <Icon name="users" className="w-5 h-5" />
                      </span>
                      <div className="font-extrabold text-sm group-hover:text-primary transition">ورود دانشجو</div>
                      <div className="text-[11px] text-muted mt-0.5">کد دانشجویی + رمز عبور</div>
                    </Link>
                    <Link
                      href="/login/teacher"
                      className="card p-4 hover:shadow-lift hover:-translate-y-0.5 transition group"
                    >
                      <span
                        className="w-10 h-10 rounded-xl grid place-items-center text-white mb-2.5 bg-amber-500"
                      >
                        <Icon name="cap" className="w-5 h-5" />
                      </span>
                      <div className="font-extrabold text-sm group-hover:text-primary transition">ورود معلم</div>
                      <div className="text-[11px] text-muted mt-0.5">ایمیل + رمز عبور</div>
                    </Link>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    <span>
                      حساب نداری؟{" "}
                      <Link href="/signup/student" className="text-primary font-bold hover:underline">
                        ثبت‌نام دانشجویی
                      </Link>
                    </span>
                    <span>
                      معلمی؟{" "}
                      <Link href="/signup/teacher" className="text-primary font-bold hover:underline">
                        ثبت‌نام معلم
                      </Link>
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="anim-float">
            <div className="card overflow-hidden shadow-lift [backface-visibility:hidden] [transform:translateZ(0)]">
              <div className="flex items-center gap-2.5 p-3.5 border-b border-line bg-slate-50/80">
                <span className="w-9 h-9 rounded-full bg-indigo-100 grid place-items-center text-lg">🧑‍💻</span>
                <div className="text-sm font-bold">سارا</div>
                <span className="mr-auto text-[11px] font-bold px-2.5 py-1 rounded-full text-white bg-emerald-500">تیم آلفا</span>
              </div>
              <div className="bg-[#0b1020]">
              <pre className="bg-[#282a36] text-[#f8f8f2] p-5 text-[13.5px] leading-7 font-mono text-left" dir="ltr">
{`def greet(name):
    return f"Hello, {name}!"

print(greet("world"))
10 / 2`}
              </pre>
              <div className="p-3 bg-[#0b1020] text-emerald-400 font-mono text-[13px] text-left leading-6 whitespace-pre-line" dir="ltr">
                Hello, world!{"\n"}5.0
              </div>
              </div>
              <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-t border-line text-xs text-muted">
                <Icon name="message" className="w-4 h-4 shrink-0" />
                <span>علی: عالیه، بریم سراغ تمرین بعدی!</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        <h2 className="text-center font-extrabold text-2xl mb-2">همه‌چیز برای یه کلاس زنده</h2>
        <p className="text-center text-sm text-muted mb-8">از نوشتن اولین خط کد تا مسابقه‌ی تیمی</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {([
            { icon: "users", title: "کار تیمی", desc: "تیم بساز، سلول‌های مشترک داشته باش و ویرایش هم‌تیمی‌ها رو زنده ببین." },
            { icon: "zap", title: "اجرای آنی", desc: "کد پایتون مستقیم توی مرورگر با Pyodide اجرا می‌شه." },
            { icon: "message", title: "چت تیمی", desc: "اعضای هر تیم توی یه چت خصوصی و زنده با هم هماهنگ می‌شن." },
            { icon: "file", title: "تمرین با تست خودکار", desc: "معلم تست‌کیس تعریف می‌کنه و پاسخ دانشجو همون لحظه چک می‌شه." },
            { icon: "help", title: "کوییز زنده", desc: "سوال چندگزینه‌ای با تایمر و رتبه‌بندی لحظه‌ای." },
            { icon: "flag", title: "مسابقه‌ی تیمی", desc: "همه‌ی تیم‌ها یه سوال رو با محدودیت زمان حل می‌کنن." },
            { icon: "chart", title: "داشبورد دانشجو", desc: "تمرین‌ها، کوییزها و مسابقه‌های خودت با نمره‌ها و نمودار فعالیت هفتگی." },
            { icon: "trophy", title: "پنل معلم با نمودار", desc: "هر معلم فقط کلاس‌های خودش را می‌بیند: فعالیت دانشجوها، میانگین نمره‌ها و آمار تمرین و کوییز." },
          ] as const).map((f) => (
            <div key={f.title} className="card p-6 hover:shadow-lift hover:-translate-y-1 transition duration-300">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 grid place-items-center mb-3.5 text-primary">
                <Icon name={f.icon} className="w-6 h-6" />
              </div>
              <h3 className="font-bold mb-1.5">{f.title}</h3>
              <p className="text-sm text-muted leading-7">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <div className="card p-8 md:p-10 grid md:grid-cols-3 gap-8 text-center">
          {[
            { n: "۱", t: "معلم کلاس می‌سازه", d: "اسم کلاس و یه رمز مدیریت — یه کد ۶ حرفی می‌گیره." },
            { n: "۲", t: "دانشجوها وارد می‌شن", d: "با کد یا لینک وارد می‌شن و توی یه تیم عضو می‌شن." },
            { n: "۳", t: "کد، چت و رقابت", d: "می‌نویسن، اجرا می‌کنن، تمرین حل می‌کنن و مسابقه می‌دن." },
          ].map((s) => (
            <div key={s.n}>
              <div className="w-12 h-12 mx-auto rounded-full grid place-items-center text-white font-extrabold text-lg shadow-glow mb-3" style={{ background: "var(--grad)" }}>
                {s.n}
              </div>
              <h3 className="font-bold mb-1">{s.t}</h3>
              <p className="text-sm text-muted leading-7">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="text-center text-xs text-muted pb-10">ساخته‌شده با Next.js + Supabase · Python در مرورگر با Pyodide</footer>

      <ProfileModal
        open={profileOpen}
        firstTime={needsProfile}
        onClose={() => {
          const wasFirstTime = needsProfile;
          setProfileOpen(false);
          if (wasFirstTime) setWelcomeOpen(true);
        }}
      />
      <WelcomeModal open={welcomeOpen} onClose={() => setWelcomeOpen(false)} />
    </div>
  );
}
