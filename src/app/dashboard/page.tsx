"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ToastProvider";
import Icon from "@/components/Icon";
import ProfileModal from "@/components/ProfileModal";
import { joinClassByCode } from "@/lib/classJoin";
import { listJoinedClasses, rememberClass, forgetClass, type JoinedClass } from "@/lib/joinedClasses";
import { faNum } from "@/lib/auth";
import { BarsChart, MiniBars, ProgressBar, ProgressRing, dailyCounts } from "@/components/Charts";
import { ListSkeleton } from "@/components/Skeleton";

// A UUID that can never exist — lets a query run even with an empty id list.
const NO_IDS = ["00000000-0000-0000-0000-000000000000"];

interface ClassItem {
  id: string;
  title: string;
  class_id: string;
  created_at: string;
}
interface QuizItem extends ClassItem {
  status: string;
  time_limit: number;
}
interface MyExerciseSub {
  exercise_id: string;
  status: string;
  score: number;
  passed_tests: number;
  total_tests: number;
  submitted_at: string;
}
interface MyQuizAnswer {
  quiz_id: string;
  score: number;
  total_questions: number;
  submitted_at: string;
}
interface MyCompSub {
  competition_id: string;
  team_name: string | null;
  submitted_at: string;
}

const SUB_STATUS: Record<string, { text: string; cls: string }> = {
  correct: { text: "درست", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  partial: { text: "ناقص", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  wrong: { text: "غلط", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  error: { text: "خطا", cls: "bg-slate-100 text-muted border-line" },
  pending: { text: "در انتظار", cls: "bg-slate-100 text-muted border-line" },
};

const ITEM_STATUS: Record<string, { text: string; cls: string }> = {
  draft: { text: "پیش‌نویس", cls: "bg-slate-100 text-muted border-line" },
  active: { text: "فعال", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  ended: { text: "پایان‌یافته", cls: "bg-slate-100 text-muted border-line" },
};

function faDay(iso: string): string {
  return new Date(iso).toLocaleDateString("fa-IR");
}

export default function StudentDashboardPage() {
  const { user, ready, isTeacher, needsProfile, displayName, avatar, signOut } = useAuth();
  const toast = useToast();

  const [classes, setClasses] = useState<JoinedClass[]>([]);
  const [exercises, setExercises] = useState<ClassItem[]>([]);
  const [quizzes, setQuizzes] = useState<QuizItem[]>([]);
  const [comps, setComps] = useState<QuizItem[]>([]);
  const [exSubs, setExSubs] = useState<MyExerciseSub[]>([]);
  const [answers, setAnswers] = useState<MyQuizAnswer[]>([]);
  const [compSubs, setCompSubs] = useState<MyCompSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const mine = listJoinedClasses();
    setClasses(mine);
    const ids = mine.length ? mine.map((c) => c.id) : NO_IDS;
    const [exR, qR, cR, subR, ansR, compR] = await Promise.all([
      supabase.from("exercises").select("id, title, class_id, created_at").in("class_id", ids).order("created_at", { ascending: false }),
      supabase.from("quizzes").select("id, title, class_id, status, time_limit, created_at").in("class_id", ids).order("created_at", { ascending: false }),
      supabase.from("competitions").select("id, title, class_id, status, time_limit, created_at").in("class_id", ids).order("created_at", { ascending: false }),
      supabase.from("exercise_submissions").select("exercise_id, status, score, passed_tests, total_tests, submitted_at").eq("user_id", user.id),
      supabase.from("quiz_answers").select("quiz_id, score, total_questions, submitted_at").eq("user_id", user.id),
      supabase.from("competition_submissions").select("competition_id, team_name, submitted_at").eq("user_id", user.id),
    ]);
    setExercises((exR.data as ClassItem[] | null) || []);
    // Drafts belong to the teacher; students only see what is running/finished.
    setQuizzes(((qR.data as QuizItem[] | null) || []).filter((q) => q.status !== "draft"));
    setComps(((cR.data as QuizItem[] | null) || []).filter((c) => c.status !== "draft"));
    setExSubs((subR.data as MyExerciseSub[] | null) || []);
    setAnswers((ansR.data as MyQuizAnswer[] | null) || []);
    setCompSubs((compR.data as MyCompSub[] | null) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  // ---------- derived stats ----------
  const classTitles = useMemo(() => {
    const map: Record<string, string> = {};
    classes.forEach((c) => (map[c.id] = c.title));
    return map;
  }, [classes]);
  const classCodes = useMemo(() => {
    const map: Record<string, string> = {};
    classes.forEach((c) => (map[c.id] = c.code));
    return map;
  }, [classes]);

  const subByExercise = useMemo(() => {
    const map: Record<string, MyExerciseSub> = {};
    exSubs.forEach((s) => (map[s.exercise_id] = s));
    return map;
  }, [exSubs]);
  const answerByQuiz = useMemo(() => {
    const map: Record<string, MyQuizAnswer> = {};
    answers.forEach((a) => (map[a.quiz_id] = a));
    return map;
  }, [answers]);
  const compByComp = useMemo(() => {
    const map: Record<string, MyCompSub> = {};
    compSubs.forEach((c) => (map[c.competition_id] = c));
    return map;
  }, [compSubs]);

  const solved = exSubs.filter((s) => s.status === "correct").length;
  const avgQuiz = answers.length
    ? Math.round(
        answers.reduce((n, a) => n + (a.total_questions ? (a.score / a.total_questions) * 100 : 0), 0) / answers.length
      )
    : 0;
  const points = solved * 10 + Math.round(avgQuiz * 0.3) + compSubs.length * 8;
  const level = Math.floor(points / 100) + 1;

  const allDates = useMemo(
    () =>
      [...exSubs.map((s) => s.submitted_at), ...answers.map((a) => a.submitted_at), ...compSubs.map((c) => c.submitted_at)].filter(
        Boolean
      ) as string[],
    [exSubs, answers, compSubs]
  );
  const activity = useMemo(() => dailyCounts(allDates, 7), [allDates]);
  const weekTotal = activity.values.reduce((n, v) => n + v, 0);

  const perClass = useMemo(
    () =>
      classes.map((c) => {
        const clsEx = exercises.filter((e) => e.class_id === c.id);
        return {
          cls: c,
          exercises: clsEx.length,
          quizzes: quizzes.filter((q) => q.class_id === c.id).length,
          comps: comps.filter((x) => x.class_id === c.id).length,
          solved: clsEx.filter((e) => subByExercise[e.id]?.status === "correct").length,
        };
      }),
    [classes, exercises, quizzes, comps, subByExercise]
  );

  const badges = [
    { icon: "target" as const, text: `تمرین حل‌شده: ${faNum(solved)}`, on: solved > 0 },
    { icon: "help" as const, text: `کوییز داده: ${faNum(answers.length)}`, on: answers.length > 0 },
    { icon: "flag" as const, text: `مسابقه: ${faNum(compSubs.length)}`, on: compSubs.length > 0 },
    { icon: "award" as const, text: `میانگین کوییز: ${faNum(avgQuiz)}٪`, on: answers.length > 0 },
  ];

  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return toast("کد کلاس را وارد کن", "err");
    setBusy(true);
    try {
      const cls = await joinClassByCode(code);
      rememberClass(cls);
      setJoinCode("");
      toast(`به کلاس «${cls.title}» اضافه شدی`, "ok");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "کلاس با این کد پیدا نشد", "err");
    } finally {
      setBusy(false);
    }
  };

  const removeClass = (id: string) => {
    setClasses(forgetClass(id));
    toast("از لیست حذف شد", "info");
  };

  if (!ready) {
    return (
      <div className="min-h-screen max-w-5xl mx-auto px-6 py-10 space-y-4">
        <div className="skeleton h-28 rounded-2xl" />
        <div className="grid sm:grid-cols-2 gap-4">
          <ListSkeleton rows={3} />
          <ListSkeleton rows={3} />
        </div>
      </div>
    );
  }
  if (!user) return null;

  const ringCls = needsProfile ? "border-primary/40 ring-2 ring-primary/25" : "border-line";

  return (
    <div className="min-h-screen pb-20">
      {/* ===== Header ===== */}
      <nav className="sticky top-0 z-40 glass px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="font-extrabold text-ink flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl grid place-items-center text-white shadow-glow" style={{ background: "var(--grad)" }}>
              <Icon name="terminal" className="w-5 h-5" />
            </span>
            <span className="hidden sm:inline">دفترچه کلاس پایتون</span>
          </Link>
          <div className="flex-1" />
          <Link href="/" className="btn-ghost hidden sm:inline-flex">
            صفحه اصلی
          </Link>
          {isTeacher && (
            <Link href="/admin" className="btn-ghost hidden sm:inline-flex">
              پنل مدیریت
            </Link>
          )}
          <button
            onClick={() => setProfileOpen(true)}
            title={needsProfile ? "نام و آواتارت را تنظیم کن" : "پروفایل"}
            className={`flex items-center gap-2 pl-3 pr-1.5 py-1 bg-white border rounded-full text-sm font-bold text-primary hover:shadow-soft transition ${ringCls}`}
          >
            <span className="w-7 h-7 rounded-full bg-indigo-50 grid place-items-center text-base">{avatar}</span>
            <span className="hidden sm:inline">{displayName || "پروفایل"}</span>
          </button>
          <button onClick={() => void signOut()} className="btn-ghost" title="خروج از حساب">
            <Icon name="logout" className="w-4 h-4" />
          </button>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* ===== Hero / points ===== */}
        <section className="card p-6 flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-12 h-12 rounded-full bg-indigo-50 grid place-items-center text-2xl">{avatar}</span>
              <div>
                <h1 className="font-extrabold text-xl">{displayName || "دانشجو"}</h1>
                <div className="text-xs text-muted">
                  {isTeacher ? "حساب معلم" : "حساب دانشجویی"} · سطح {faNum(level)}
                </div>
              </div>
            </div>
            {needsProfile && (
              <button
                onClick={() => setProfileOpen(true)}
                className="w-full sm:w-auto card p-3 flex items-center gap-2 text-right border-primary/30 hover:shadow-soft transition mb-3"
              >
                <Icon name="sparkles" className="w-4 h-4 text-primary shrink-0" />
                <span className="text-xs font-bold">اسم و آواتارت را تنظیم کن</span>
                <Icon name="arrowLeft" className="w-4 h-4 text-primary mr-auto" />
              </button>
            )}
            <div className="flex flex-wrap gap-2">
              {badges
                .filter((b) => b.on)
                .map((b) => (
                  <span
                    key={b.text}
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-white border border-line"
                  >
                    <Icon name={b.icon} className="w-3.5 h-3.5 text-primary" />
                    {b.text}
                  </span>
                ))}
              {!badges.some((b) => b.on) && (
                <span className="text-[11px] text-muted">اولین تمرین یا کوییزت را انجام بده تا نشان بگیری.</span>
              )}
            </div>
          </div>
          <div className="text-center shrink-0">
            <ProgressRing value={points % 100} caption={`امتیاز: ${faNum(points)}`} />
          </div>
        </section>

        {/* ===== Join a class + activity ===== */}
        <section className="grid md:grid-cols-2 gap-4">
          <div className="card p-5">
            <h2 className="font-extrabold text-sm mb-3 flex items-center gap-2">
              <Icon name="plus" className="w-4 h-4 text-primary" /> پیوستن به کلاس جدید
            </h2>
            <div className="flex gap-2">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && void handleJoin()}
                placeholder="مثلاً A1B2C3"
                className="w-full border border-line rounded-xl px-4 py-2.5 text-center tracking-widest font-bold outline-none focus:border-primary"
              />
              <button onClick={() => void handleJoin()} disabled={busy} className="btn-primary shrink-0">
                {busy ? "…" : "ورود"}
              </button>
            </div>
            <p className="text-[11px] text-muted mt-2">کد کلاس را از معلمت بگیر و همینجا وارد کن.</p>
          </div>
          <div className="card p-5">
            <h2 className="font-extrabold text-sm mb-3 flex items-center gap-2">
              <Icon name="chart" className="w-4 h-4 text-primary" /> فعالیت ۷ روز اخیر
            </h2>
            <MiniBars values={activity.values} labels={activity.labels} suffix=" فعالیت" />
            <p className="text-[11px] text-muted mt-2">
              مجموع {faNum(weekTotal)} فعالیت (ارسال تمرین، پاسخ کوییز، مسابقه)
            </p>
          </div>
        </section>

        {/* ===== My classes ===== */}
        <section>
          <h2 className="font-extrabold text-sm mb-3 flex items-center gap-2">
            <Icon name="school" className="w-4 h-4 text-primary" /> کلاس‌های من
          </h2>
          {perClass.length === 0 ? (
            <div className="card p-8 text-center text-sm text-muted">هنوز توی هیچ کلاسی نیستی — با کد بالا وارد شو.</div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {perClass.map((c) => (
                <div key={c.cls.id} className="card p-5 flex flex-col gap-3 hover:shadow-lift hover:-translate-y-0.5 transition">
                  <div className="flex items-start gap-2">
                    <span className="w-9 h-9 rounded-xl bg-indigo-50 grid place-items-center text-primary shrink-0">
                      <Icon name="book" className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="font-extrabold text-sm truncate">{c.cls.title}</div>
                      <div className="text-[11px] text-muted font-mono tracking-widest">{c.cls.code}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { n: c.exercises, t: "تمرین" },
                      { n: c.quizzes, t: "کوییز" },
                      { n: c.comps, t: "مسابقه" },
                    ].map((x) => (
                      <div key={x.t} className="rounded-xl bg-slate-50 border border-line py-2">
                        <div className="font-extrabold">{faNum(x.n)}</div>
                        <div className="text-[10px] text-muted">{x.t}</div>
                      </div>
                    ))}
                  </div>
                  <ProgressBar
                    value={c.solved}
                    max={Math.max(c.exercises, 1)}
                    label={`حل‌شده: ${faNum(c.solved)} از ${faNum(c.exercises)}`}
                    tone="emerald"
                    showValue={false}
                  />
                  <div className="flex gap-2 mt-auto">
                    <Link href={`/class/${c.cls.code}`} className="btn-primary flex-1">
                      ورود به کلاس
                    </Link>
                    <button onClick={() => removeClass(c.cls.id)} className="btn-ghost !px-3" title="حذف از لیست">
                      <Icon name="trash" className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ===== Exercises ===== */}
        <section>
          <h2 className="font-extrabold text-sm mb-3 flex items-center gap-2">
            <Icon name="file" className="w-4 h-4 text-primary" /> تمرین‌های من
            <span className="text-[11px] text-muted font-normal mr-auto">
              {faNum(exSubs.filter((s) => s.status === "correct").length)} حل‌شده از {faNum(exercises.length)}
            </span>
          </h2>
          {loading ? (
            <ListSkeleton rows={4} />
          ) : exercises.length === 0 ? (
            <div className="card p-6 text-center text-sm text-muted">
              تمرینی برای کلاس‌هایت پیدا نشد — اول وارد کلاس شو.
            </div>
          ) : (
            <div className="card divide-y divide-line overflow-hidden">
              {exercises.map((e) => {
                const s = subByExercise[e.id];
                const st = s ? SUB_STATUS[s.status] || SUB_STATUS.pending : null;
                const code = classCodes[e.class_id];
                return (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <Icon name="file" className="w-4 h-4 text-muted shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold truncate">{e.title}</div>
                      <div className="text-[11px] text-muted truncate">
                        {classTitles[e.class_id] || "کلاس"}
                        {s?.submitted_at ? ` · ${faDay(s.submitted_at)}` : ""}
                      </div>
                    </div>
                    {s && (
                      <span className="text-[11px] font-bold text-ink shrink-0">{faNum(s.score)}٪</span>
                    )}
                    <span
                      className={`text-[10px] font-bold border rounded-full px-2 py-0.5 shrink-0 ${
                        st ? st.cls : "bg-slate-100 text-muted border-line"
                      }`}
                    >
                      {st ? st.text : "شروع‌نشده"}
                    </span>
                    {code && (
                      <Link href={`/class/${code}`} className="btn-ghost !px-2.5 !py-1.5 !text-[11px] shrink-0">
                        ورود
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ===== Quizzes ===== */}
        <section>
          <h2 className="font-extrabold text-sm mb-3 flex items-center gap-2">
            <Icon name="help" className="w-4 h-4 text-primary" /> کوییزهای من
            <span className="text-[11px] text-muted font-normal mr-auto">
              میانگین {faNum(avgQuiz)}٪ از {faNum(answers.length)} پاسخ
            </span>
          </h2>
          {loading ? (
            <ListSkeleton rows={4} />
          ) : quizzes.length === 0 ? (
            <div className="card p-6 text-center text-sm text-muted">هنوز کوییزی برای کلاس‌هایت ثبت نشده.</div>
          ) : (
            <div className="card divide-y divide-line overflow-hidden">
              {quizzes.map((q) => {
                const a = answerByQuiz[q.id];
                const qs = ITEM_STATUS[q.status] || ITEM_STATUS.ended;
                const code = classCodes[q.class_id];
                const pctAnswered = a && a.total_questions ? Math.round((a.score / a.total_questions) * 100) : null;
                return (
                  <div key={q.id} className="flex items-center gap-3 px-4 py-3">
                    <Icon name="help" className="w-4 h-4 text-muted shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold truncate">{q.title}</div>
                      <div className="text-[11px] text-muted truncate">
                        {classTitles[q.class_id] || "کلاس"}
                        {a?.submitted_at ? ` · ${faDay(a.submitted_at)}` : ""}
                      </div>
                    </div>
                    {a && (
                      <span className="text-[11px] font-bold text-ink shrink-0">
                        {faNum(a.score)}/{faNum(a.total_questions)} نمره
                      </span>
                    )}
                    {pctAnswered !== null && <span className="text-[11px] font-bold text-primary shrink-0">{faNum(pctAnswered)}٪</span>}
                    <span className={`text-[10px] font-bold border rounded-full px-2 py-0.5 shrink-0 ${qs.cls}`}>
                      {a ? "پاسخ‌داده" : qs.text}
                    </span>
                    {code && (
                      <Link href={`/class/${code}`} className="btn-ghost !px-2.5 !py-1.5 !text-[11px] shrink-0">
                        ورود
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ===== Competitions ===== */}
        <section>
          <h2 className="font-extrabold text-sm mb-3 flex items-center gap-2">
            <Icon name="flag" className="w-4 h-4 text-primary" /> مسابقه‌های من
            <span className="text-[11px] text-muted font-normal mr-auto">{faNum(compSubs.length)} ارسال</span>
          </h2>
          {loading ? (
            <ListSkeleton rows={3} />
          ) : comps.length === 0 ? (
            <div className="card p-6 text-center text-sm text-muted">هنوز مسابقه‌ای برای کلاس‌هات برگزار نشده.</div>
          ) : (
            <div className="card divide-y divide-line overflow-hidden">
              {comps.map((c) => {
                const cs = compByComp[c.id];
                const st = ITEM_STATUS[c.status] || ITEM_STATUS.ended;
                const code = classCodes[c.class_id];
                return (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                    <Icon name="flag" className="w-4 h-4 text-muted shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold truncate">{c.title}</div>
                      <div className="text-[11px] text-muted truncate">
                        {classTitles[c.class_id] || "کلاس"}
                        {cs?.team_name ? ` · تیم ${cs.team_name}` : ""}
                        {cs?.submitted_at ? ` · ${faDay(cs.submitted_at)}` : ""}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold border rounded-full px-2 py-0.5 shrink-0 ${
                        cs ? "bg-emerald-50 text-emerald-700 border-emerald-200" : st.cls
                      }`}
                    >
                      {cs ? "ارسال‌شده" : st.text}
                    </span>
                    {code && (
                      <Link href={`/class/${code}`} className="btn-ghost !px-2.5 !py-1.5 !text-[11px] shrink-0">
                        ورود
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ===== Charts: result distribution + progress ===== */}
        <section className="grid md:grid-cols-2 gap-4">
          <div className="card p-5">
            <h2 className="font-extrabold text-sm mb-3 flex items-center gap-2">
              <Icon name="chart" className="w-4 h-4 text-primary" /> وضعیت تمرین‌های من
            </h2>
            <BarsChart
              height={120}
              items={[
                { label: "درست", value: exSubs.filter((s) => s.status === "correct").length },
                { label: "ناقص", value: exSubs.filter((s) => s.status === "partial").length },
                { label: "غلط", value: exSubs.filter((s) => s.status === "wrong" || s.status === "error").length },
                { label: "شروع‌نشده", value: Math.max(exercises.length - exSubs.length, 0) },
              ]}
              emptyText="هنوز تمرینی را امتحان نکرده‌ای"
            />
          </div>
          <div className="card p-5">
            <h2 className="font-extrabold text-sm mb-4 flex items-center gap-2">
              <Icon name="target" className="w-4 h-4 text-primary" /> پیشرفت من
            </h2>
            <div className="space-y-4">
              <ProgressBar
                value={solved}
                max={Math.max(exercises.length, 1)}
                label="تمرین حل‌شده"
                suffix={` از ${faNum(exercises.length)}`}
                tone="emerald"
              />
              <ProgressBar
                value={answers.length}
                max={Math.max(quizzes.length, 1)}
                label="کوییز پاسخ‌داده"
                suffix={` از ${faNum(quizzes.length)}`}
                tone="amber"
              />
              <ProgressBar
                value={compSubs.length}
                max={Math.max(comps.length, 1)}
                label="مسابقه شرکت‌شده"
                suffix={` از ${faNum(comps.length)}`}
              />
            </div>
            <p className="text-[11px] text-muted mt-4">
              امتیاز کل: {faNum(points)} · سطح {faNum(level)} · میانگین کوییز {faNum(avgQuiz)}٪
            </p>
          </div>
        </section>
      </main>

      <ProfileModal open={profileOpen} firstTime={needsProfile} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
