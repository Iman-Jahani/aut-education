"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/Skeleton";
import Icon, { type IconName } from "@/components/Icon";
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

const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "admin2025";

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  draft: { text: "پیش‌نویس", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  active: { text: "فعال", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  ended: { text: "پایان‌یافته", cls: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
};

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (sessionStorage.getItem("adminAuth") === "true") setAuthed(true);
  }, []);

  const login = () => {
    if (password === ADMIN_PASSWORD) {
      sessionStorage.setItem("adminAuth", "true");
      setAuthed(true);
    } else {
      setError("رمز عبور اشتباه است");
    }
  };

  if (!authed) {
    return (
      <div className="min-h-screen grid place-items-center p-4">
        <div className="bg-white border border-line rounded-2xl shadow-xl p-8 w-full max-w-sm">
          <div className="flex justify-center text-primary mb-2">
            <Icon name="lock" className="w-9 h-9" />
          </div>
          <h1 className="font-extrabold text-lg text-center mb-6">پنل مدیریت</h1>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
            placeholder="رمز عبور"
            className="w-full border border-line rounded-lg px-3 py-2.5 mb-2 outline-none focus:border-primary"
          />
          {error && <div className="text-danger text-xs mb-3">{error}</div>}
          <button
            onClick={login}
            className="w-full py-2.5 rounded-lg text-sm font-bold text-white bg-gradient-to-br from-primary to-primary2 mt-2 inline-flex items-center justify-center gap-2"
          >
            <Icon name="lock" className="w-4 h-4" /> ورود
          </button>
        </div>
      </div>
    );
  }

  return <Dashboard onLogout={() => { sessionStorage.removeItem("adminAuth"); setAuthed(false); }} />;
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [cells, setCells] = useState<Cell[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [exerciseSubs, setExerciseSubs] = useState<ExerciseSubmission[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswer[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [compSubs, setCompSubs] = useState<CompetitionSubmission[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const loadData = async () => {
    setLoading(true);
    const [sR, tR, mR, cR, cmR, exR, exsR, qR, qaR, coR, csR, upR, msgR] = await Promise.all([
      supabase.from("class_sessions").select("*").order("created_at", { ascending: false }),
      supabase.from("teams").select("*").order("created_at", { ascending: true }),
      supabase.from("team_members").select("*").order("joined_at", { ascending: true }),
      supabase.from("cells").select("*").order("created_at", { ascending: false }),
      supabase.from("comments").select("*").order("created_at", { ascending: false }),
      supabase.from("exercises").select("*").order("created_at", { ascending: false }),
      supabase.from("exercise_submissions").select("*"),
      supabase.from("quizzes").select("*").order("created_at", { ascending: false }),
      supabase.from("quiz_answers").select("*"),
      supabase.from("competitions").select("*").order("created_at", { ascending: false }),
      supabase.from("competition_submissions").select("*"),
      supabase.from("user_profiles").select("*"),
      supabase.from("team_messages").select("*"),
    ]);
    setSessions(sR.data || []);
    setTeams(tR.data || []);
    setMembers(mR.data || []);
    setCells(cR.data || []);
    setComments(cmR.data || []);
    setExercises(exR.data || []);
    setExerciseSubs(exsR.data || []);
    setQuizzes(qR.data || []);
    setQuizAnswers(qaR.data || []);
    setCompetitions(coR.data || []);
    setCompSubs(csR.data || []);
    setProfiles(upR.data || []);
    setMessages(msgR.data || []);
    setLoading(false);
    setLastUpdated(new Date());
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Per-class indexes ----------
  const byClass = <T extends { class_id: string }>(list: T[]) => {
    const map: Record<string, T[]> = {};
    list.forEach((x) => (map[x.class_id] = [...(map[x.class_id] || []), x]));
    return map;
  };

  const teamsByClass = useMemo(() => byClass(teams), [teams]);
  const cellsByClass = useMemo(() => byClass(cells), [cells]);
  const exercisesByClass = useMemo(() => byClass(exercises), [exercises]);
  const quizzesByClass = useMemo(() => byClass(quizzes), [quizzes]);
  const competitionsByClass = useMemo(() => byClass(competitions), [competitions]);

  const cellIdsByClass = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    cells.forEach((c) => {
      (map[c.class_id] = map[c.class_id] || new Set()).add(c.id);
    });
    return map;
  }, [cells]);

  const commentsByClass = useMemo(() => {
    const map: Record<string, number> = {};
    comments.forEach((c) => {
      Object.keys(cellIdsByClass).forEach((cid) => {
        if (cellIdsByClass[cid].has(c.cell_id)) map[cid] = (map[cid] || 0) + 1;
      });
    });
    return map;
  }, [comments, cellIdsByClass]);

  const membersByClass = useMemo(() => {
    const teamClass: Record<string, string> = {};
    teams.forEach((t) => (teamClass[t.id] = t.class_id));
    const map: Record<string, TeamMember[]> = {};
    members.forEach((m) => {
      const cid = teamClass[m.team_id];
      if (cid) (map[cid] = map[cid] || []).push(m);
    });
    return map;
  }, [members, teams]);

  const membersByTeam = useMemo(() => {
    const map: Record<string, TeamMember[]> = {};
    members.forEach((m) => (map[m.team_id] = [...(map[m.team_id] || []), m]));
    return map;
  }, [members]);

  const messagesByTeam = useMemo(() => {
    const map: Record<string, number> = {};
    messages.forEach((m) => (map[m.team_id] = (map[m.team_id] || 0) + 1));
    return map;
  }, [messages]);

  const subsByExercise = useMemo(() => {
    const map: Record<string, ExerciseSubmission[]> = {};
    exerciseSubs.forEach((s) => (map[s.exercise_id] = [...(map[s.exercise_id] || []), s]));
    return map;
  }, [exerciseSubs]);

  const answersByQuiz = useMemo(() => {
    const map: Record<string, QuizAnswer[]> = {};
    quizAnswers.forEach((a) => (map[a.quiz_id] = [...(map[a.quiz_id] || []), a]));
    return map;
  }, [quizAnswers]);

  const subsByComp = useMemo(() => {
    const map: Record<string, CompetitionSubmission[]> = {};
    compSubs.forEach((s) => (map[s.competition_id] = [...(map[s.competition_id] || []), s]));
    return map;
  }, [compSubs]);

  const profileByUser = useMemo(() => {
    const map: Record<string, UserProfile> = {};
    profiles.forEach((p) => (map[p.user_id] = p));
    return map;
  }, [profiles]);

  const studentsByClass = useMemo(() => {
    const map: Record<string, { id: string; name: string }[]> = {};
    Object.entries(membersByClass).forEach(([cid, list]) => {
      const seen = new Map<string, string>();
      list.forEach((m) => {
        if (!seen.has(m.user_id)) seen.set(m.user_id, m.display_name);
      });
      map[cid] = Array.from(seen, ([id, name]) => ({ id, name }));
    });
    return map;
  }, [membersByClass]);

  const totalStudents = useMemo(() => {
    const all = new Set<string>();
    members.forEach((m) => all.add(m.user_id));
    profiles.forEach((p) => all.add(p.user_id));
    return all.size;
  }, [members, profiles]);

  const filteredSessions = sessions.filter(
    (s) =>
      !search ||
      s.title?.toLowerCase().includes(search.toLowerCase()) ||
      s.code?.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur border-b border-slate-700 px-6 py-4 flex items-center gap-3">
        <span className="w-9 h-9 rounded-xl grid place-items-center bg-gradient-to-br from-primary to-primary2 shrink-0">
          <Icon name="settings" className="w-5 h-5 text-white" />
        </span>
        <h1 className="font-extrabold text-lg">پنل مدیریت کلاس‌های پایتون</h1>
        <div className="flex-1" />
        <span className="text-xs text-slate-400">
          {loading ? "در حال بارگذاری…" : lastUpdated ? `آخرین به‌روزرسانی: ${lastUpdated.toLocaleTimeString("fa-IR")}` : ""}
        </span>
        <button
          onClick={loadData}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-700 hover:bg-slate-600"
        >
          <Icon name="refresh" className="w-4 h-4" /> بروزرسانی
        </button>
        <button
          onClick={onLogout}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600/80 hover:bg-red-600"
        >
          <Icon name="logout" className="w-4 h-4" /> خروج
        </button>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          {loading && !lastUpdated ? (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} dark className="h-[92px] !rounded-2xl" />)
          ) : (
            <>
              <StatCard icon="school" label="تعداد کلاس‌ها" value={sessions.length} />
              <StatCard icon="users" label="دانشجوها" value={totalStudents} />
              <StatCard icon="layers" label="تیم‌ها" value={teams.length} />
              <StatCard icon="code" label="سلول‌ها" value={cells.length} />
            </>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {loading && !lastUpdated ? (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} dark className="h-[92px] !rounded-2xl" />)
          ) : (
            <>
              <StatCard icon="message" label="کامنت‌ها" value={comments.length} />
              <StatCard icon="file" label="تمرین‌ها" value={exercises.length} />
              <StatCard icon="help" label="کوییزها" value={quizzes.length} />
              <StatCard icon="flag" label="مسابقه‌ها" value={competitions.length} />
            </>
          )}
        </div>

        <div className="relative mb-5 max-w-md">
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

        {/* ===== Per-class cards ===== */}
        <div className="space-y-4">
          {loading && !lastUpdated && [0, 1].map((i) => <Skeleton key={i} dark className="h-24 !rounded-2xl" />)}

          {!loading && !filteredSessions.length && (
            <div className="bg-slate-800/60 border border-slate-700 rounded-2xl text-center text-slate-400 py-12">
              کلاسی پیدا نشد.
            </div>
          )}

          {filteredSessions.map((s) => {
            const open = !collapsed[s.id];
            const clsTeams = teamsByClass[s.id] || [];
            const clsCells = cellsByClass[s.id] || [];
            const clsExercises = exercisesByClass[s.id] || [];
            const clsQuizzes = quizzesByClass[s.id] || [];
            const clsComps = competitionsByClass[s.id] || [];
            const clsStudents = studentsByClass[s.id] || [];
            const clsComments = commentsByClass[s.id] || 0;
            const clsMessages = clsTeams.reduce((n, t) => n + (messagesByTeam[t.id] || 0), 0);
            const exSubs = clsExercises.reduce((n, e) => n + (subsByExercise[e.id] || []).length, 0);
            const qAnswers = clsQuizzes.reduce((n, q) => n + (answersByQuiz[q.id] || []).length, 0);
            const cSubs = clsComps.reduce((n, c) => n + (subsByComp[c.id] || []).length, 0);

            return (
              <section key={s.id} className="bg-slate-800/60 border border-slate-700 rounded-2xl overflow-hidden">
                <button
                  onClick={() => toggle(s.id)}
                  className="w-full px-5 py-4 flex items-center gap-3 text-right hover:bg-slate-700/30 transition"
                >
                  <span className="w-10 h-10 rounded-xl grid place-items-center bg-gradient-to-br from-primary to-primary2 shrink-0">
                    <Icon name="school" className="w-5 h-5 text-white" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold truncate">{s.title}</span>
                      <span className="font-mono text-xs tracking-widest text-primary2 bg-primary/10 border border-primary/20 rounded px-2 py-0.5">
                        {s.code}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {s.created_at ? new Date(s.created_at).toLocaleDateString("fa-IR") : "—"}
                      </span>
                    </span>
                    <span className="flex items-center gap-3 flex-wrap text-[11px] text-slate-400 mt-1.5">
                      <Meta icon="users" value={`${clsStudents.length} دانشجو`} />
                      <Meta icon="layers" value={`${clsTeams.length} تیم`} />
                      <Meta icon="code" value={`${clsCells.length} سلول`} />
                      <Meta icon="message" value={`${clsComments} کامنت`} />
                      <Meta icon="file" value={`${clsExercises.length} تمرین`} />
                      <Meta icon="help" value={`${clsQuizzes.length} کوییز`} />
                      <Meta icon="flag" value={`${clsComps.length} مسابقه`} />
                    </span>
                  </span>
                  <span className="flex-1" />
                  <Link
                    href={`/class/${s.code}`}
                    onClick={(e) => e.stopPropagation()}
                    className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/15 text-primary border border-primary/25 hover:bg-primary hover:text-white transition shrink-0"
                  >
                    <Icon name="external" className="w-3.5 h-3.5" /> باز کردن
                  </Link>
                  <span className={`text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}>
                    <Icon name="chevronDown" className="w-5 h-5" />
                  </span>
                </button>

                {open && (
                  <div className="border-t border-slate-700 px-5 py-5 space-y-5">
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3">
                      <MiniStat icon="users" label="دانشجو" value={clsStudents.length} />
                      <MiniStat icon="layers" label="تیم" value={clsTeams.length} />
                      <MiniStat icon="code" label="سلول" value={clsCells.length} />
                      <MiniStat icon="message" label="کامنت" value={clsComments} />
                      <MiniStat icon="file" label="تمرین / پاسخ" value={`${clsExercises.length} / ${exSubs}`} />
                      <MiniStat icon="help" label="کوییز / پاسخ" value={`${clsQuizzes.length} / ${qAnswers}`} />
                      <MiniStat icon="flag" label="مسابقه / ارسال" value={`${clsComps.length} / ${cSubs}`} />
                      <MiniStat icon="message" label="پیام چت" value={clsMessages} />
                    </div>

                    <Block title="دانشجویان کلاس" icon="users">
                      {clsStudents.length ? (
                        <div className="flex flex-wrap gap-2">
                          {clsStudents.map((st) => (
                            <span
                              key={st.id}
                              className="inline-flex items-center gap-1.5 bg-slate-700/50 border border-slate-600 rounded-full pl-3 pr-1.5 py-1 text-xs"
                            >
                              <span className="w-6 h-6 rounded-full bg-slate-600 grid place-items-center text-sm">
                                {profileByUser[st.id]?.avatar || "👤"}
                              </span>
                              {st.name || "بدون نام"}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <Empty text="هنوز عضوی توی تیم‌های این کلاس نیست." />
                      )}
                    </Block>

                    <Block title="تیم‌ها" icon="layers">
                      {clsTeams.length ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="text-slate-400 text-xs">
                              <tr>
                                <th className="text-right px-3 py-2 font-medium">تیم</th>
                                <th className="text-right px-3 py-2 font-medium">اعضا</th>
                                <th className="text-right px-3 py-2 font-medium">سلول‌ها</th>
                                <th className="text-right px-3 py-2 font-medium">پیام‌ها</th>
                              </tr>
                            </thead>
                            <tbody>
                              {clsTeams.map((t) => (
                                <tr key={t.id} className="border-t border-slate-700/60">
                                  <td className="px-3 py-2.5 font-bold whitespace-nowrap">
                                    <span className="inline-block w-3 h-3 rounded-full ml-2 align-middle" style={{ background: t.color }} />
                                    {t.name}
                                  </td>
                                  <td className="px-3 py-2.5 text-slate-300">
                                    {(membersByTeam[t.id] || []).map((m) => m.display_name).join("، ") || "—"}
                                  </td>
                                  <td className="px-3 py-2.5">{clsCells.filter((c) => c.team_id === t.id).length}</td>
                                  <td className="px-3 py-2.5">{messagesByTeam[t.id] || 0}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <Empty text="تیمی ساخته نشده." />
                      )}
                    </Block>

                    <Block title="تمرین‌ها و پاسخ‌ها" icon="file">
                      {clsExercises.length ? (
                        <ul className="space-y-1.5">
                          {clsExercises.map((e) => {
                            const subs = subsByExercise[e.id] || [];
                            const correct = subs.filter((x) => x.status === "correct").length;
                            return (
                              <li key={e.id} className="flex items-center gap-2 text-sm bg-slate-700/30 rounded-lg px-3 py-2">
                                <Icon name="file" className="w-4 h-4 text-slate-400 shrink-0" />
                                <span className="font-bold truncate">{e.title}</span>
                                <span className="flex-1" />
                                <span className="text-xs text-slate-400">{subs.length} پاسخ</span>
                                <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-0.5">
                                  {correct} درست
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <Empty text="تمرینی ثبت نشده." />
                      )}
                    </Block>

                    <Block title="کوییزها" icon="help">
                      {clsQuizzes.length ? (
                        <ul className="space-y-1.5">
                          {clsQuizzes.map((q) => {
                            const ans = answersByQuiz[q.id] || [];
                            const avg = ans.length
                              ? Math.round((ans.reduce((n, a) => n + (a.score || 0), 0) / ans.length) * 10) / 10
                              : 0;
                            return (
                              <li key={q.id} className="flex items-center gap-2 text-sm bg-slate-700/30 rounded-lg px-3 py-2">
                                <Icon name="help" className="w-4 h-4 text-slate-400 shrink-0" />
                                <span className="font-bold truncate">{q.title}</span>
                                <StatusPill status={q.status} />
                                <span className="flex-1" />
                                <span className="text-xs text-slate-400">{(q.questions || []).length} سوال</span>
                                <span className="text-xs text-slate-400">{ans.length} پاسخ</span>
                                <span className="text-xs font-bold text-primary2 bg-primary/10 border border-primary/20 rounded px-2 py-0.5">
                                  میانگین {avg}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <Empty text="کوییزی ساخته نشده." />
                      )}
                    </Block>

                    <Block title="مسابقه‌ها" icon="flag">
                      {clsComps.length ? (
                        <ul className="space-y-1.5">
                          {clsComps.map((c) => (
                            <li key={c.id} className="flex items-center gap-2 text-sm bg-slate-700/30 rounded-lg px-3 py-2">
                              <Icon name="flag" className="w-4 h-4 text-slate-400 shrink-0" />
                              <span className="font-bold truncate">{c.title}</span>
                              <StatusPill status={c.status} />
                              <span className="flex-1" />
                              <span className="text-xs text-slate-400">{(subsByComp[c.id] || []).length} ارسال تیم‌ها</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <Empty text="مسابقه‌ای ثبت نشده." />
                      )}
                    </Block>

                    <Block title="آخرین سلول‌های کلاس" icon="code">
                      {clsCells.length ? (
                        <ul className="space-y-1.5">
                          {clsCells.slice(0, 6).map((c) => (
                            <li key={c.id} className="flex items-center gap-2 text-sm bg-slate-700/30 rounded-lg px-3 py-2">
                              <span className="w-6 h-6 rounded-full bg-slate-600 grid place-items-center text-sm shrink-0">
                                {profileByUser[c.author_id]?.avatar || "👤"}
                              </span>
                              <span className="font-bold text-xs whitespace-nowrap">{c.author_name || "ناشناس"}</span>
                              {c.team_name && (
                                <span className="text-[10px] font-bold text-white rounded-full px-2 py-0.5 whitespace-nowrap bg-primary">
                                  {c.team_name}
                                </span>
                              )}
                              <code className="flex-1 min-w-0 truncate text-[12px] text-emerald-300 font-mono text-left" dir="ltr">
                                {(c.code || "").trim().split("\n")[0] || "—"}
                              </code>
                              <span className="text-[11px] text-slate-500 whitespace-nowrap">
                                {c.created_at ? new Date(c.created_at).toLocaleDateString("fa-IR") : "—"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <Empty text="سلولی توی این کلاس نوشته نشده." />
                      )}
                    </Block>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}

// ---------- small building blocks ----------

function StatCard({ icon, label, value }: { icon: IconName; label: string; value: number }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-5">
      <div className="flex items-center gap-2 text-slate-400 mb-2">
        <Icon name={icon} className="w-4 h-4" />
        <span className="text-xs">{label}</span>
      </div>
      <div className="text-3xl font-extrabold bg-gradient-to-br from-primary to-primary2 bg-clip-text text-transparent">
        {value}
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
      <div className="font-extrabold text-lg">{value}</div>
    </div>
  );
}

function Meta({ icon, value }: { icon: IconName; value: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Icon name={icon} className="w-3.5 h-3.5" />
      {value}
    </span>
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
  return <span className={`text-[10px] font-bold border rounded-full px-2 py-0.5 whitespace-nowrap ${s.cls}`}>{s.text}</span>;
}

function Empty({ text }: { text: string }) {
  return <div className="text-xs text-slate-500 py-2">{text}</div>;
}







