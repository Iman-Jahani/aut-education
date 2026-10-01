"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { faNum } from "@/lib/auth";
import { fmtRelative } from "@/lib/utils";
import { Skeleton } from "@/components/Skeleton";
import Icon, { type IconName } from "@/components/Icon";
import { BarsChart, MiniBars, ProgressBar, ProgressRing, dailyCounts } from "@/components/Charts";
import type {
  ClassSession,
  Team,
  TeamMember,
  Cell,
  Comment,
  Exercise,
  ExerciseSubmission,
  Quiz,
  QuizAnswer,
  Competition,
  CompetitionSubmission,
  UserProfile,
  TeamMessage,
} from "@/lib/types";

// Teacher panel — personalized per teacher: every query below is scoped to the
// signed-in teacher's own classes (teacher_id, created_by as legacy fallback).
// Auth is the real one: middleware only lets teachers reach /admin and RLS
// still guards the tables, so the old client-side password gate is gone.

// A UUID that can never exist — keeps `.in()` queries valid on empty lists.
const NO_IDS = ["00000000-0000-0000-0000-000000000000"];
const guard = (ids: string[]) => (ids.length ? ids : NO_IDS);

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  draft: { text: "پیش‌نویس", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  active: { text: "فعال", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  ended: { text: "پایان‌یافته", cls: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
};

type Tab = "overview" | "classes" | "students" | "exercises" | "quizzes" | "competitions";

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: "overview", label: "نمای کلی", icon: "chart" },
  { key: "classes", label: "کلاس‌ها", icon: "school" },
  { key: "students", label: "دانشجوها", icon: "users" },
  { key: "exercises", label: "تمرین‌ها", icon: "file" },
  { key: "quizzes", label: "کوییزها", icon: "help" },
  { key: "competitions", label: "مسابقه‌ها", icon: "flag" },
];

interface Dataset {
  sessions: ClassSession[];
  teams: Team[];
  members: TeamMember[];
  cells: Cell[];
  comments: Comment[];
  exercises: Exercise[];
  exerciseSubs: ExerciseSubmission[];
  quizzes: Quiz[];
  quizAnswers: QuizAnswer[];
  competitions: Competition[];
  compSubs: CompetitionSubmission[];
  profiles: UserProfile[];
  messages: TeamMessage[];
}

const EMPTY: Dataset = {
  sessions: [],
  teams: [],
  members: [],
  cells: [],
  comments: [],
  exercises: [],
  exerciseSubs: [],
  quizzes: [],
  quizAnswers: [],
  competitions: [],
  compSubs: [],
  profiles: [],
  messages: [],
};

export default function AdminPage() {
  const { user, ready, isTeacher, displayName, avatar, signOut } = useAuth();
  const [data, setData] = useState<Dataset>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const uid = user.id;

    // 1) my classes only (teacher_id; created_by covers rows from before it)
    const { data: clsData } = await supabase
      .from("class_sessions")
      .select("*")
      .or(`teacher_id.eq.${uid},created_by.eq.${uid}`)
      .order("created_at", { ascending: false });
    const sessions = (clsData as ClassSession[] | null) || [];
    const ids = guard(sessions.map((s) => s.id));

    const [tR, cR, exR, qR, coR, upR] = await Promise.all([
      supabase.from("teams").select("*").in("class_id", ids).order("created_at", { ascending: true }),
      supabase.from("cells").select("*").in("class_id", ids).order("created_at", { ascending: false }),
      supabase.from("exercises").select("*").in("class_id", ids).order("created_at", { ascending: false }),
      supabase.from("quizzes").select("*").in("class_id", ids).order("created_at", { ascending: false }),
      supabase.from("competitions").select("*").in("class_id", ids).order("created_at", { ascending: false }),
      supabase.from("user_profiles").select("*"),
    ]);
    const teams = (tR.data as Team[] | null) || [];
    const cells = (cR.data as Cell[] | null) || [];
    const exercises = (exR.data as Exercise[] | null) || [];
    const quizzes = (qR.data as Quiz[] | null) || [];
    const competitions = (coR.data as Competition[] | null) || [];
    const profiles = (upR.data as UserProfile[] | null) || [];

    // 2) everything reachable from those rows
    const [mR, cmR, msgR, exsR, qaR, csR] = await Promise.all([
      supabase.from("team_members").select("*").in("team_id", guard(teams.map((t) => t.id))).order("joined_at", { ascending: true }),
      supabase.from("comments").select("*").in("cell_id", guard(cells.map((c) => c.id))).order("created_at", { ascending: false }),
      supabase.from("team_messages").select("*").in("team_id", guard(teams.map((t) => t.id))),
      supabase.from("exercise_submissions").select("*").in("exercise_id", guard(exercises.map((e) => e.id))),
      supabase.from("quiz_answers").select("*").in("quiz_id", guard(quizzes.map((q) => q.id))),
      supabase.from("competition_submissions").select("*").in("competition_id", guard(competitions.map((c) => c.id))),
    ]);

    setData({
      sessions,
      teams,
      cells,
      exercises,
      quizzes,
      competitions,
      profiles,
      members: (mR.data as TeamMember[] | null) || [],
      comments: (cmR.data as Comment[] | null) || [],
      messages: (msgR.data as TeamMessage[] | null) || [],
      exerciseSubs: (exsR.data as ExerciseSubmission[] | null) || [],
      quizAnswers: (qaR.data as QuizAnswer[] | null) || [],
      compSubs: (csR.data as CompetitionSubmission[] | null) || [],
    });
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ---------- indexes ----------
  const byClass = <T extends { class_id: string }>(list: T[]) => {
    const map: Record<string, T[]> = {};
    list.forEach((x) => (map[x.class_id] = [...(map[x.class_id] || []), x]));
    return map;
  };

  const teamsByClass = useMemo(() => byClass(data.teams), [data.teams]);
  const cellsByClass = useMemo(() => byClass(data.cells), [data.cells]);
  const exercisesByClass = useMemo(() => byClass(data.exercises), [data.exercises]);
  const quizzesByClass = useMemo(() => byClass(data.quizzes), [data.quizzes]);
  const compsByClass = useMemo(() => byClass(data.competitions), [data.competitions]);

  /** id → class_id for cells/exercises/quizzes/competitions (ids are unique). */
  const classOf = useMemo(() => {
    const m: Record<string, string> = {};
    data.exercises.forEach((x) => (m[x.id] = x.class_id));
    data.quizzes.forEach((x) => (m[x.id] = x.class_id));
    data.competitions.forEach((x) => (m[x.id] = x.class_id));
    data.cells.forEach((x) => (m[x.id] = x.class_id));
    return m;
  }, [data]);

  const commentsByClass = useMemo(() => {
    const m: Record<string, number> = {};
    data.comments.forEach((c) => {
      const k = classOf[c.cell_id];
      if (k) m[k] = (m[k] || 0) + 1;
    });
    return m;
  }, [data.comments, classOf]);

  const profileByUser = useMemo(() => {
    const m: Record<string, UserProfile> = {};
    data.profiles.forEach((p) => (m[p.user_id] = p));
    return m;
  }, [data.profiles]);

  // ---------- per-student activity ----------
  interface StudentStat {
    id: string;
    name: string;
    avatar: string;
    cells: number;
    subs: number;
    solved: number;
    quizzes: number;
    quizPct: number;
    comps: number;
    last: number;
    score: number;
    qSum: number;
    qMax: number;
  }

  const students = useMemo<StudentStat[]>(() => {
    const m = new Map<string, StudentStat>();
    const touch = (id?: string | null, name?: string | null): StudentStat | undefined => {
      if (!id) return undefined;
      let s = m.get(id);
      if (!s) {
        s = {
          id,
          name: name || "دانشجو",
          avatar: "👤",
          cells: 0,
          subs: 0,
          solved: 0,
          quizzes: 0,
          quizPct: 0,
          comps: 0,
          last: 0,
          score: 0,
          qSum: 0,
          qMax: 0,
        };
        m.set(id, s);
      }
      if (name && (s.name === "دانشجو" || !s.name)) s.name = name;
      return s;
    };
    const at = (id?: string | null, iso?: string | null) => {
      const s = touch(id);
      if (s && iso) {
        const t = new Date(iso).getTime();
        if (t > s.last) s.last = t;
      }
    };

    data.members.forEach((x) => touch(x.user_id, x.display_name));
    data.cells.forEach((x) => {
      const s = touch(x.author_id, x.author_name);
      if (s) s.cells += 1;
      at(x.author_id, x.created_at);
    });
    data.exerciseSubs.forEach((x) => {
      const s = touch(x.user_id, x.author_name);
      if (s) {
        s.subs += 1;
        if (x.status === "correct") s.solved += 1;
      }
      at(x.user_id, x.submitted_at);
    });
    data.quizAnswers.forEach((x) => {
      const s = touch(x.user_id, x.author_name);
      if (s) {
        s.quizzes += 1;
        s.qSum += x.total_questions ? (x.score / x.total_questions) * 100 : 0;
        s.qMax += 1;
      }
      at(x.user_id, x.submitted_at);
    });
    data.compSubs.forEach((x) => {
      const s = touch(x.user_id, x.author_name);
      if (s) s.comps += 1;
      at(x.user_id, x.submitted_at);
    });
    m.forEach((s) => {
      const p = profileByUser[s.id];
      if (p) {
        if (p.display_name) s.name = p.display_name;
        if (p.avatar) s.avatar = p.avatar;
      }
    });
    m.forEach((s) => {
      s.quizPct = s.qMax ? Math.round((s.qSum / s.qMax) * 100) : 0;
      s.score = s.solved * 10 + Math.round(s.quizPct * 0.3) + s.comps * 8;
    });
    return [...m.values()];
  }, [data, profileByUser]);

  // ---------- search / aggregates ----------
  const filteredSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data.sessions;
    return data.sessions.filter((s) => s.title.toLowerCase().includes(q) || s.code.toLowerCase().includes(q));
  }, [data.sessions, search]);

  const activityDates = useMemo(
    () =>
      [
        ...data.cells.map((c) => c.created_at),
        ...data.exerciseSubs.map((s) => s.submitted_at),
        ...data.quizAnswers.map((a) => a.submitted_at),
        ...data.compSubs.map((s) => s.submitted_at),
      ].filter(Boolean) as string[],
    [data]
  );
  const activity14 = useMemo(() => dailyCounts(activityDates, 14), [activityDates]);

  const totals = useMemo(() => {
    const subs = data.exerciseSubs;
    const correct = subs.filter((s) => s.status === "correct").length;
    const ans = data.quizAnswers;
    const avgQuiz = ans.length
      ? Math.round(ans.reduce((n, a) => n + (a.total_questions ? (a.score / a.total_questions) * 100 : 0), 0) / ans.length)
      : 0;
    const week = Date.now() - 7 * 86400000;
    return {
      classes: data.sessions.length,
      students: students.length,
      teams: data.teams.length,
      cells: data.cells.length,
      comments: data.comments.length + data.messages.length,
      exercises: data.exercises.length,
      quizzes: data.quizzes.length,
      comps: data.competitions.length,
      subs: subs.length,
      correct,
      passPct: subs.length ? Math.round((correct / subs.length) * 100) : 0,
      answers: ans.length,
      avgQuiz,
      activeWeek: students.filter((s) => s.last >= week).length,
    };
  }, [data, students]);

  const quizAvgByClass = useMemo(
    () =>
      data.sessions.map((s) => {
        const ids = (quizzesByClass[s.id] || []).map((q) => q.id);
        const list = data.quizAnswers.filter((a) => ids.includes(a.quiz_id));
        const avg = list.length
          ? Math.round(list.reduce((n, a) => n + (a.total_questions ? (a.score / a.total_questions) * 100 : 0), 0) / list.length)
          : 0;
        return { label: s.title, value: avg, hint: `${s.title}: ${faNum(avg)}٪` };
      }),
    [data.sessions, data.quizAnswers, quizzesByClass]
  );

  const topStudents = useMemo(() => [...students].sort((a, b) => b.score - a.score).slice(0, 6), [students]);

  const statusBars = useMemo(() => {
    const subs = data.exerciseSubs;
    return [
      { label: "درست", value: subs.filter((s) => s.status === "correct").length },
      { label: "ناقص", value: subs.filter((s) => s.status === "partial").length },
      { label: "غلط", value: subs.filter((s) => s.status === "wrong" || s.status === "error").length },
    ];
  }, [data.exerciseSubs]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => !q || s.name.toLowerCase().includes(q)).sort((a, b) => b.score - a.score);
  }, [students, search]);

  // ---------- guards ----------
  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-300">
        <div className="max-w-6xl mx-auto px-6 py-8 space-y-4">
          <Skeleton dark className="h-16 !rounded-2xl" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} dark className="h-[92px] !rounded-2xl" />
            ))}
          </div>
          <Skeleton dark className="h-40 !rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!isTeacher) {
    return (
      <div className="min-h-screen grid place-items-center p-6 text-center text-slate-300 bg-slate-950">
        <div>
          <Icon name="lock" className="w-10 h-10 mx-auto mb-3 text-primary2" />
          <p className="text-sm mb-4">این پنل فقط برای حساب معلم است.</p>
          <Link href="/" className="btn-primary">
            بازگشت به صفحه اصلی
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300">
      {/* ===== Header ===== */}
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl grid place-items-center text-white shrink-0" style={{ background: "var(--grad)" }}>
            <Icon name="cap" className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <div className="font-extrabold text-sm text-white truncate">
              پنل معلم{displayName ? ` — ${displayName}` : ""}
            </div>
            <div className="text-[11px] text-slate-500">
              {loading ? "در حال بارگذاری…" : `${faNum(totals.classes)} کلاس · ${faNum(totals.students)} دانشجو`}
            </div>
          </div>
          <span className="w-8 h-8 rounded-full bg-slate-800 grid place-items-center" title={displayName}>
            {avatar}
          </span>
          <div className="flex-1" />
          <button
            onClick={() => void loadData()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-700 hover:bg-slate-600"
          >
            <Icon name="refresh" className="w-4 h-4" /> بروزرسانی
          </button>
          <Link href="/" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-700 hover:bg-slate-600">
            <Icon name="home" className="w-4 h-4" /> صفحه اصلی
          </Link>
          <button
            onClick={() => void signOut()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600/80 hover:bg-red-600"
          >
            <Icon name="logout" className="w-4 h-4" /> خروج
          </button>
        </div>

        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-6 pb-3 flex items-center gap-1.5 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition ${
                tab === t.key ? "bg-indigo-500 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon name={t.icon} className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} dark className="h-[92px] !rounded-2xl" />
              ))}
            </div>
            <Skeleton dark className="h-40 !rounded-2xl" />
          </div>
        ) : totals.classes === 0 ? (
          <div className="bg-slate-800/60 border border-slate-700 rounded-2xl text-center py-14 px-6">
            <Icon name="school" className="w-10 h-10 mx-auto mb-3 text-slate-500" />
            <p className="text-sm text-slate-400 mb-4">هنوز هیچ کلاسی با حساب خودت نساختی.</p>
            <Link href="/" className="btn-primary">
              ساخت کلاس جدید
            </Link>
            <p className="text-[11px] text-slate-500 mt-3">
              از صفحه اصلی «ساخت کلاس جدید» را بزن؛ این پنل همان لحظه با آمار کلاس پر می‌شود.
            </p>
          </div>
        ) : (
          <>
            {/* ===== نمای کلی ===== */}
            {tab === "overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <StatCard icon="school" label="کلاس‌ها" value={totals.classes} />
                  <StatCard icon="users" label="دانشجوها" value={totals.students} />
                  <StatCard icon="layers" label="تیم‌ها" value={totals.teams} />
                  <StatCard icon="code" label="سلول‌ها" value={totals.cells} />
                  <StatCard icon="message" label="کامنت و چت" value={totals.comments} />
                  <StatCard icon="file" label="تمرین‌ها" value={totals.exercises} />
                  <StatCard icon="help" label="کوییزها" value={totals.quizzes} />
                  <StatCard icon="flag" label="مسابقه‌ها" value={totals.comps} />
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-5">
                    <Block title="فعالیت ۱۴ روز اخیر" icon="chart">
                      <MiniBars
                        values={activity14.values}
                        labels={activity14.labels.map((l, i) => (i % 2 === 0 ? l : ""))}
                        dark
                        suffix=" رویداد"
                      />
                      <p className="text-[11px] text-slate-500 mt-2">
                        مجموع {faNum(activity14.values.reduce((n, v) => n + v, 0))} رویداد در دو هفته اخیر
                      </p>
                    </Block>
                  </div>

                  <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-5">
                    <Block title="وضعیت پاسخ تمرین‌ها" icon="target">
                      <BarsChart items={statusBars} dark height={130} emptyText="هنوز پاسخی ثبت نشده" />
                    </Block>
                  </div>

                  <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-5">
                    <Block title="میانگین کوییز به تفکیک کلاس" icon="help">
                      <BarsChart items={quizAvgByClass} dark height={130} suffix="٪" tone="amber" emptyText="کوییزی برگزار نشده" />
                    </Block>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-5">
                    <Block title="نمره‌دهی" icon="award">
                      <div className="flex items-center justify-around flex-wrap gap-3 pt-2">
                        <ProgressRing
                          dark
                          value={totals.passPct}
                          caption={`پاسخ درست تمرین (${faNum(totals.correct)}/${faNum(totals.subs)})`}
                        />
                        <ProgressRing
                          dark
                          value={totals.avgQuiz}
                          tone="amber"
                          caption={`میانگین کوییز (${faNum(totals.answers)} پاسخ)`}
                        />
                        <ProgressRing
                          dark
                          value={totals.students ? Math.round((totals.activeWeek / totals.students) * 100) : 0}
                          tone="emerald"
                          caption={`فعال این هفته (${faNum(totals.activeWeek)}/${faNum(totals.students)})`}
                        />
                      </div>
                    </Block>
                  </div>

                  <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-5">
                    <Block title="دانشجوهای برتر (بر اساس امتیاز)" icon="trophy">
                      {topStudents.length === 0 ? (
                        <Empty text="هنوز دانشجویی فعالیتی ثبت نکرده." />
                      ) : (
                        <div className="space-y-3 pt-1">
                          {topStudents.map((s) => (
                            <ProgressBar
                              key={s.id}
                              dark
                              value={s.score}
                              max={Math.max(topStudents[0].score, 1)}
                              label={`${s.avatar} ${s.name} · ${faNum(s.solved)} تمرین · ${faNum(s.quizPct)}٪ کوییز`}
                              suffix=" امتیاز"
                            />
                          ))}
                        </div>
                      )}
                    </Block>
                  </div>
                </div>
              </div>
            )}

            {/* ===== کلاس‌ها ===== */}
            {tab === "classes" && (
              <div className="space-y-4">
                <div className="relative max-w-md">
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                    <Icon name="search" className="w-4 h-4" />
                  </span>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="جستجوی کلاس با نام یا کد…"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pr-9 pl-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>

                {filteredSessions.length === 0 ? (
                  <div className="bg-slate-800/60 border border-slate-700 rounded-2xl text-center text-slate-400 py-10">
                    کلاسی با این عبارت پیدا نشد.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredSessions.map((s) => {
                      const open = !collapsed[s.id];
                      const clsTeams = teamsByClass[s.id] || [];
                      const clsCells = cellsByClass[s.id] || [];
                      const clsEx = exercisesByClass[s.id] || [];
                      const clsQ = quizzesByClass[s.id] || [];
                      const clsC = compsByClass[s.id] || [];
                      const teamIds = clsTeams.map((t) => t.id);
                      const clsMembers = data.members.filter((m) => teamIds.includes(m.team_id));
                      const who = new Set<string>(clsMembers.map((m) => m.user_id));
                      clsCells.forEach((c) => who.add(c.author_id));
                      const clsSubs = data.exerciseSubs.filter((x) => clsEx.some((e) => e.id === x.exercise_id));
                      const clsAns = data.quizAnswers.filter((a) => clsQ.some((q) => q.id === a.quiz_id));
                      const dates = [
                        ...clsCells.map((c) => c.created_at),
                        ...clsSubs.map((x) => x.submitted_at),
                        ...clsAns.map((a) => a.submitted_at),
                      ].filter(Boolean) as string[];
                      const act = dailyCounts(dates, 7);
                      const clsStudents = students.filter((st) => who.has(st.id)).sort((a, b) => b.score - a.score);
                      return (
                        <div key={s.id} className="bg-slate-800/60 border border-slate-700 rounded-2xl overflow-hidden">
                          <div className="flex items-center gap-3 px-5 py-4">
                            <button
                              onClick={() => setCollapsed((c) => ({ ...c, [s.id]: !c[s.id] }))}
                              className="text-slate-400 hover:text-white"
                            >
                              <Icon name={open ? "chevronUp" : "chevronDown"} className="w-5 h-5" />
                            </button>
                            <div className="min-w-0">
                              <div className="font-extrabold text-sm text-white truncate">{s.title}</div>
                              <div className="text-[11px] text-slate-500">
                                کد: <span className="font-mono tracking-widest">{s.code}</span> · {faNum(who.size)} دانشجو ·{" "}
                                {faNum(clsCells.length)} سلول
                              </div>
                            </div>
                            <div className="flex-1" />
                            <button
                              onClick={() => {
                                void navigator.clipboard?.writeText(`${window.location.origin}/class/${s.code}`);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-700 hover:bg-slate-600"
                            >
                              <Icon name="copy" className="w-4 h-4" /> کپی لینک
                            </button>
                            <Link
                              href={`/class/${s.code}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500"
                            >
                              <Icon name="external" className="w-4 h-4" /> ورود
                            </Link>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 px-5 pb-4">
                            <MiniStat icon="users" label="تیم" value={clsTeams.length} />
                            <MiniStat icon="message" label="کامنت" value={commentsByClass[s.id] || 0} />
                            <MiniStat icon="file" label="تمرین" value={clsEx.length} />
                            <MiniStat icon="help" label="کوییز" value={clsQ.length} />
                            <MiniStat icon="flag" label="مسابقه" value={clsC.length} />
                          </div>

                          {open && (
                            <div className="px-5 pb-5 space-y-4 border-t border-slate-700/70 pt-4">
                              <div className="grid md:grid-cols-2 gap-4">
                                <Block title="فعالیت ۷ روز اخیر" icon="chart">
                                  <MiniBars values={act.values} labels={act.labels} dark suffix=" رویداد" />
                                </Block>
                                <Block title="میزان پاسخ" icon="target">
                                  <div className="space-y-2.5 pt-1">
                                    <ProgressBar
                                      dark
                                      value={clsSubs.length}
                                      max={Math.max(clsEx.length * Math.max(who.size, 1), 1)}
                                      label="ارسال پاسخ تمرین"
                                    />
                                    <ProgressBar
                                      dark
                                      value={clsAns.length}
                                      max={Math.max(clsQ.length * Math.max(who.size, 1), 1)}
                                      label="پاسخ کوییز"
                                      tone="amber"
                                    />
                                    <ProgressBar
                                      dark
                                      value={clsMembers.length}
                                      max={Math.max(who.size, 1)}
                                      label="عضو تیم"
                                      tone="emerald"
                                    />
                                  </div>
                                </Block>
                              </div>

                              <Block title={`دانشجوهای این کلاس (${faNum(clsStudents.length)})`} icon="users">
                                {clsStudents.length === 0 ? (
                                  <Empty text="هنوز دانشجویی وارد این کلاس نشده." />
                                ) : (
                                  <div className="space-y-3">
                                    {clsStudents.slice(0, 8).map((st) => (
                                      <ProgressBar
                                        key={st.id}
                                        dark
                                        value={st.score}
                                        max={Math.max(clsStudents[0].score, 1)}
                                        label={`${st.avatar} ${st.name} · ${faNum(st.cells)} سلول · ${faNum(st.solved)} تمرین · ${faNum(st.quizPct)}٪`}
                                        suffix=" امتیاز"
                                      />
                                    ))}
                                  </div>
                                )}
                              </Block>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ===== دانشجوها ===== */}
            {tab === "students" && (
              <div className="space-y-4">
                <div className="relative max-w-md">
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                    <Icon name="search" className="w-4 h-4" />
                  </span>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="جستجوی دانشجو با نام…"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pr-9 pl-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>

                {filteredStudents.length === 0 ? (
                  <div className="bg-slate-800/60 border border-slate-700 rounded-2xl text-center text-slate-400 py-10">
                    دانشجویی پیدا نشد (هنوز کسی وارد کلاس‌هایت نشده).
                  </div>
                ) : (
                  <div className="bg-slate-800/60 border border-slate-700 rounded-2xl overflow-hidden">
                    <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-3 text-[11px] font-bold text-slate-400 bg-slate-900/60">
                      <span className="col-span-4">دانشجو</span>
                      <span className="col-span-2 text-center">سلول</span>
                      <span className="col-span-2 text-center">تمرین درست</span>
                      <span className="col-span-2 text-center">کوییز</span>
                      <span className="col-span-2 text-center">امتیاز</span>
                    </div>
                    <div className="divide-y divide-slate-700/70">
                      {filteredStudents.map((s) => (
                        <div key={s.id} className="grid grid-cols-12 gap-2 px-5 py-3 items-center">
                          <span className="col-span-4 flex items-center gap-2 min-w-0">
                            <span className="w-7 h-7 rounded-full bg-slate-700 grid place-items-center shrink-0 text-sm">
                              {s.avatar}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-xs font-bold text-white truncate">{s.name}</span>
                              <span className="block text-[10px] text-slate-500 truncate">
                                {s.last ? `آخرین فعالیت: ${fmtRelative(new Date(s.last).toISOString())}` : "بدون فعالیت"}
                              </span>
                            </span>
                          </span>
                          <span className="col-span-2 text-center text-xs font-bold">{faNum(s.cells)}</span>
                          <span className="col-span-2 text-center text-xs font-bold text-emerald-400">
                            {faNum(s.solved)}/{faNum(s.subs)}
                          </span>
                          <span className="col-span-2 text-center text-xs font-bold text-amber-400">{faNum(s.quizPct)}٪</span>
                          <span className="col-span-2 text-center text-xs font-bold text-white">{faNum(s.score)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ===== تمرین‌ها ===== */}
            {tab === "exercises" && (
              <div className="bg-slate-800/60 border border-slate-700 rounded-2xl overflow-hidden">
                {data.exercises.length === 0 ? (
                  <div className="text-center text-slate-400 py-10 text-sm">تمرینی در کلاس‌هایت ساخته نشده.</div>
                ) : (
                  <div className="divide-y divide-slate-700/70">
                    {data.exercises.map((e) => {
                      const subs = data.exerciseSubs.filter((x) => x.exercise_id === e.id);
                      const ok = subs.filter((x) => x.status === "correct").length;
                      const avg = subs.length ? Math.round(subs.reduce((n, x) => n + (x.score || 0), 0) / subs.length) : 0;
                      const clsTitle = data.sessions.find((s) => s.id === e.class_id)?.title || "کلاس";
                      return (
                        <div key={e.id} className="px-5 py-3.5 flex items-center gap-4">
                          <Icon name="file" className="w-4 h-4 text-slate-400 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-white truncate">{e.title}</div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {clsTitle} · {faNum(subs.length)} پاسخ
                            </div>
                          </div>
                          <div className="w-36 sm:w-44 shrink-0">
                            <ProgressBar
                              dark
                              value={ok}
                              max={Math.max(subs.length, 1)}
                              label="درست"
                              suffix={` ${faNum(ok)}/${faNum(subs.length)}`}
                            />
                          </div>
                          <span className="text-xs font-bold text-white w-14 text-center shrink-0">{faNum(avg)}٪</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ===== کوییزها ===== */}
            {tab === "quizzes" && (
              <div className="bg-slate-800/60 border border-slate-700 rounded-2xl overflow-hidden">
                {data.quizzes.length === 0 ? (
                  <div className="text-center text-slate-400 py-10 text-sm">کوییزی در کلاس‌هایت ساخته نشده.</div>
                ) : (
                  <div className="divide-y divide-slate-700/70">
                    {data.quizzes.map((q) => {
                      const ans = data.quizAnswers.filter((a) => a.quiz_id === q.id);
                      const avg = ans.length
                        ? Math.round(
                            ans.reduce((n, a) => n + (a.total_questions ? (a.score / a.total_questions) * 100 : 0), 0) / ans.length
                          )
                        : 0;
                      const clsTitle = data.sessions.find((s) => s.id === q.class_id)?.title || "کلاس";
                      return (
                        <div key={q.id} className="px-5 py-3.5 flex items-center gap-4">
                          <Icon name="help" className="w-4 h-4 text-slate-400 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-white truncate">{q.title}</div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {clsTitle} · {faNum(ans.length)} پاسخ · {faNum(q.time_limit)} دقیقه
                            </div>
                          </div>
                          <StatusPill status={q.status} />
                          <span className="text-xs font-bold text-amber-400 w-14 text-center shrink-0">{faNum(avg)}٪</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ===== مسابقه‌ها ===== */}
            {tab === "competitions" && (
              <div className="bg-slate-800/60 border border-slate-700 rounded-2xl overflow-hidden">
                {data.competitions.length === 0 ? (
                  <div className="text-center text-slate-400 py-10 text-sm">مسابقه‌ای در کلاس‌هایت ساخته نشده.</div>
                ) : (
                  <div className="divide-y divide-slate-700/70">
                    {data.competitions.map((c) => {
                      const subs = data.compSubs.filter((x) => x.competition_id === c.id);
                      const teams = new Set(subs.map((x) => x.team_id));
                      const clsTitle = data.sessions.find((s) => s.id === c.class_id)?.title || "کلاس";
                      return (
                        <div key={c.id} className="px-5 py-3.5 flex items-center gap-4">
                          <Icon name="flag" className="w-4 h-4 text-slate-400 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-white truncate">{c.title}</div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {clsTitle} · {faNum(subs.length)} ارسال از {faNum(teams.size)} تیم
                            </div>
                          </div>
                          <StatusPill status={c.status} />
                          <span className="text-xs font-bold text-white w-14 text-center shrink-0">{faNum(subs.length)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ---------- small building blocks (dark theme) ----------

function StatCard({ icon, label, value }: { icon: IconName; label: string; value: number }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-5">
      <div className="flex items-center gap-2 text-slate-400 mb-2">
        <Icon name={icon} className="w-4 h-4" />
        <span className="text-xs">{label}</span>
      </div>
      <div className="text-3xl font-extrabold bg-gradient-to-br from-primary to-primary2 bg-clip-text text-transparent">
        {faNum(value)}
      </div>
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: IconName; label: string; value: number | string }) {
  return (
    <div className="bg-slate-700/30 border border-slate-600/60 rounded-xl px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
        <Icon name={icon} className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="font-extrabold text-lg">{typeof value === "number" ? faNum(value) : value}</div>
    </div>
  );
}

function Block({ title, icon, children }: { title: string; icon: IconName; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-xs font-extrabold text-slate-300 mb-2">
        <Icon name={icon} className="w-4 h-4 text-primary2" />
        {title}
      </h3>
      {children}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = STATUS_LABEL[status] || STATUS_LABEL.draft;
  return (
    <span className={`text-[10px] font-bold border rounded-full px-2 py-0.5 whitespace-nowrap ${s.cls}`}>{s.text}</span>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-xs text-slate-500 py-2">{text}</div>;
}
