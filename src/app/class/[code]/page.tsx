"use client";

import { Fragment, useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ToastProvider";
import ProfileModal from "@/components/ProfileModal";
import TeamPicker, { CurrentTeam } from "@/components/TeamPicker";
import CodeCell from "@/components/CodeCell";
import ExercisesModal from "@/components/ExercisesModal";
import QuizzesModal from "@/components/QuizzesModal";
import CompetitionsModal from "@/components/CompetitionsModal";
import TeamChat from "@/components/TeamChat";
import LiveBanner from "@/components/LiveBanner";
import { CellSkeleton, ClassPageSkeleton } from "@/components/Skeleton";
import Icon from "@/components/Icon";
import { useActiveItem } from "@/hooks/useActiveItem";
import { joinClassByCode, getClassAdminPinHash } from "@/lib/classJoin";
import { rememberClass } from "@/lib/joinedClasses";
import { hashPin } from "@/lib/utils";
import { notebookToRows, cellsToNotebook, notebookFileName } from "@/lib/notebook";
import type { Cell, ClassSession, Quiz, Competition } from "@/lib/types";

// Cells are ordered by `position` (falls back to creation time for old cells),
// which lets users insert a new cell anywhere between existing ones.
const eff = (c: Cell) => c.position ?? new Date(c.created_at).getTime();
const sortCells = (list: Cell[]) => [...list].sort((a, b) => eff(a) - eff(b));

function InsertDivider({ onClick, label = "سلول جدید اینجا" }: { onClick: () => void; label?: string }) {
  return (
    <div className="insert-divider group relative h-8 flex items-center justify-center">
      <div className="absolute inset-x-8 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition" />
      <button
        onClick={onClick}
        className="insert-btn relative z-10 flex items-center gap-1 px-3 py-1 rounded-full bg-white border border-primary/30 text-primary text-[11px] font-bold shadow-soft hover:bg-primary hover:text-white transition-colors"
      >
        <Icon name="plus" className="w-3.5 h-3.5" /> {label}
      </button>
    </div>
  );
}

function getStoredTeam(sessionId: string): CurrentTeam | null {
  if (typeof window === "undefined") return null;
  const id = localStorage.getItem("teamId_" + sessionId);
  const name = localStorage.getItem("teamName_" + sessionId);
  const color = localStorage.getItem("teamColor_" + sessionId);
  if (id && name) return { id, name, color: color || "#6366f1" };
  return null;
}
function storeTeam(sessionId: string, t: CurrentTeam) {
  localStorage.setItem("teamId_" + sessionId, t.id);
  localStorage.setItem("teamName_" + sessionId, t.name);
  localStorage.setItem("teamColor_" + sessionId, t.color);
}
function clearStoredTeam(sessionId: string) {
  localStorage.removeItem("teamId_" + sessionId);
  localStorage.removeItem("teamName_" + sessionId);
  localStorage.removeItem("teamColor_" + sessionId);
}

export default function ClassPage({ params }: { params: { code: string } }) {
  const { code } = params;
  const router = useRouter();
  const { user, ready, needsProfile, displayName, avatar, isTeacher } = useAuth();
  const toast = useToast();

  const [session, setSession] = useState<ClassSession | null>(null);
  const [notFound, setNotFound] = useState(false);
  /** Why the code could not be resolved — shown on the not-found card. */
  const [loadError, setLoadError] = useState("");
  const [cells, setCells] = useState<Cell[]>([]);
  const [loadingCells, setLoadingCells] = useState(true);
  const [authorAvatars, setAuthorAvatars] = useState<Record<string, string>>({});
  const cellsLoadedOnce = useRef(false);
  const pendingScroll = useRef<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [focusedCellId, setFocusedCellId] = useState<string | null>(null);
  const [currentTeam, setCurrentTeam] = useState<CurrentTeam | null>(null);

  const [teacherMode, setTeacherMode] = useState(false);
  const [pinInput, setPinInput] = useState("");

  const [teamPickerOpen, setTeamPickerOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [exercisesOpen, setExercisesOpen] = useState(false);
  const [exerciseBadge, setExerciseBadge] = useState(0);
  const [quizzesOpen, setQuizzesOpen] = useState(false);
  const [quizFromBanner, setQuizFromBanner] = useState(false);
  const [competitionsOpen, setCompetitionsOpen] = useState(false);
  const [compFromBanner, setCompFromBanner] = useState(false);

  // ---------- Session ----------
  useEffect(() => {
    (async () => {
      let cls: ClassSession | null = null;
      try {
        // Resolve (and join) the class through the `join_class_by_code` RPC —
        // the code lookup happens server-side instead of a direct table read,
        // so RLS on class_sessions no longer blocks students.
        cls = await joinClassByCode(code);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "کلاس با این کد پیدا نشد");
        setNotFound(true);
      }
      if (!cls) return;
      setSession(cls);
      // Remember it on this device — powers the dashboard "my classes" list.
      rememberClass(cls);
      setCurrentTeam(getStoredTeam(cls.id));
      // Restore teacher mode after a refresh: the hash we stored when the
      // teacher entered the PIN is compared with the class PIN hash.
      try {
        const stored = localStorage.getItem("teacherPin_" + cls.code);
        if (stored && stored === (await getClassAdminPinHash(cls))) setTeacherMode(true);
      } catch {
        /* localStorage unavailable — teacher just has to re-enter the PIN */
      }
    })();
  }, [code]);

  // A teacher account enters the class in teacher mode right away: the role is
  // proven by the account itself (middleware and RLS use the same rule), so
  // asking for the class PIN would be pointless. Students keep the PIN unlock.
  useEffect(() => {
    if (isTeacher) setTeacherMode(true);
  }, [isTeacher]);

  // ---------- Cells ----------
  const loadCells = useCallback(async () => {
    if (!session || !user) return;
    if (!cellsLoadedOnce.current) setLoadingCells(true);
    let q = supabase.from("cells").select("*").eq("class_id", session.id).order("created_at", { ascending: true });
    if (!teacherMode) {
      if (currentTeam?.id) {
        q = q.or(`team_id.eq.${currentTeam.id},and(team_id.is.null,author_id.eq.${user.id})`);
      } else {
        q = q.is("team_id", null).eq("author_id", user.id);
      }
    }
    const { data, error } = await q;
    if (error) toast("خطا: " + error.message, "err");
    else setCells(sortCells(data || []));
    cellsLoadedOnce.current = true;
    setLoadingCells(false);
  }, [session, user, currentTeam, teacherMode, toast]);

  useEffect(() => {
    if (session && user) loadCells();
  }, [session, user, loadCells]);

  // Avatars of everyone who wrote a visible cell (so cells show the author's
  // avatar instead of their initials).
  useEffect(() => {
    const ids = Array.from(new Set(cells.map((c) => c.author_id))).filter(Boolean);
    if (!ids.length) return;
    let cancelled = false;
    supabase
      .from("user_profiles")
      .select("user_id, avatar")
      .in("user_id", ids)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const map: Record<string, string> = {};
        data.forEach((p) => {
          if (p.avatar) map[p.user_id] = p.avatar;
        });
        setAuthorAvatars((prev) => ({ ...prev, ...map }));
      });
    return () => {
      cancelled = true;
    };
  }, [cells]);

  // Smoothly scroll to a freshly created cell once it is rendered.
  useEffect(() => {
    const id = pendingScroll.current;
    if (!id) return;
    const el = document.getElementById("cell-" + id);
    if (!el) return;
    pendingScroll.current = null;
    requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "center" }));
    setFlashId(id);
    const t = setTimeout(() => setFlashId(null), 1400);
    return () => clearTimeout(t);
  }, [cells]);

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel("cells-" + session.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "cells", filter: `class_id=eq.${session.id}` }, () => loadCells())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, loadCells]);

  // ---------- Exercise badge ----------
  const loadExerciseBadge = useCallback(async () => {
    if (!session || !user || teacherMode) return setExerciseBadge(0);
    const { data: exList } = await supabase.from("exercises").select("id").eq("class_id", session.id);
    const ids = (exList || []).map((e) => e.id);
    if (!ids.length) return setExerciseBadge(0);
    const { data: subs } = await supabase
      .from("exercise_submissions")
      .select("exercise_id, status")
      .in("exercise_id", ids)
      .eq("user_id", user.id);
    const solved = new Set((subs || []).filter((s) => s.status === "correct").map((s) => s.exercise_id));
    setExerciseBadge(ids.filter((id) => !solved.has(id)).length);
  }, [session, user, teacherMode]);

  useEffect(() => {
    loadExerciseBadge();
  }, [loadExerciseBadge]);

  // ---------- Active quiz / competition ----------
  const quiz = useActiveItem<Quiz>(
    "quizzes",
    session?.id,
    !!session && !!user,
    async (q) => {
      if (!user) return false;
      const { data } = await supabase.from("quiz_answers").select("id").eq("quiz_id", q.id).eq("user_id", user.id).maybeSingle();
      return !!data;
    },
    [user?.id],
    teacherMode
  );

  const comp = useActiveItem<Competition>(
    "competitions",
    session?.id,
    !!session && !!user,
    async (c) => {
      if (!currentTeam) return false;
      const { data } = await supabase
        .from("competition_submissions")
        .select("id")
        .eq("competition_id", c.id)
        .eq("team_id", currentTeam.id)
        .maybeSingle();
      return !!data;
    },
    [user?.id, currentTeam?.id],
    teacherMode
  );

  // ---------- Actions ----------
  // afterId: undefined → append at the end · null → insert at the very top · string → right after that cell
  const addCell = async (afterId?: string | null) => {
    if (!session || !user) return;
    // Cells carry the author name — ask for it instead of writing an empty one.
    if (!displayName) {
      setProfileOpen(true);
      toast("اول اسم و آواتارت را تنظیم کن", "err");
      return;
    }
    const now = Date.now();
    let position: number;
    if (afterId === undefined) {
      const last = cells[cells.length - 1];
      position = last ? Math.max(now, eff(last) + 1) : now;
    } else if (afterId === null) {
      position = cells.length ? eff(cells[0]) - 1000 : now;
    } else {
      const i = cells.findIndex((c) => c.id === afterId);
      const prev = cells[i];
      const next = cells[i + 1];
      position = next ? (eff(prev) + eff(next)) / 2 : Math.max(now, eff(prev) + 1);
    }
    const { data, error } = await supabase
      .from("cells")
      .insert({
        class_id: session.id,
        team_id: currentTeam?.id || null,
        team_name: currentTeam?.name || null,
        author_id: user.id,
        author_name: displayName,
        code: "",
        output: "",
        tags: [],
        position,
      })
      .select()
      .single();
    if (error || !data) {
      toast("خطا: " + (error?.message || "نامشخص"), "err");
      return;
    }
    pendingScroll.current = data.id;
    setFocusedCellId(data.id);
    // clear focus after 4s so re-renders don't steal cursor later
    setTimeout(() => setFocusedCellId((curr) => (curr === data.id ? null : curr)), 4000);
    setCells((prev) => sortCells([...prev.filter((c) => c.id !== data.id), data as Cell]));
  };

  // ---------- ipynb import / export (teacher) ----------
  const nbFileRef = useRef<HTMLInputElement>(null);
  const [importingNb, setImportingNb] = useState(false);

  // Reads a .ipynb file and appends its cells to the class.
  const importNotebook = async (file: File) => {
    if (!session || !user) return;
    setImportingNb(true);
    try {
      const raw = await file.text();
      const nb = JSON.parse(raw);
      const start = cells.length ? eff(cells[cells.length - 1]) + 1000 : Date.now();
      const rows = notebookToRows(nb, start).map((r) => ({
        class_id: session.id,
        team_id: currentTeam?.id || null,
        team_name: currentTeam?.name || null,
        author_id: user.id,
        author_name: displayName,
        code: r.code,
        output: "",
        tags: [],
        position: r.position,
      }));
      if (!rows.length) {
        toast("هیچ سلولی توی فایل ipynb پیدا نشد", "err");
        return;
      }
      const { error } = await supabase.from("cells").insert(rows);
      if (error) {
        toast("خطا: " + error.message, "err");
        return;
      }
      toast(`${rows.length} سلول از ipynb به کلاس اضافه شد`, "ok");
      await loadCells();
    } catch {
      toast("فایل ipynb معتبر نیست", "err");
    } finally {
      setImportingNb(false);
      if (nbFileRef.current) nbFileRef.current.value = "";
    }
  };

  // Builds a notebook (nbformat 4) out of every cell of the class.
  const exportNotebook = () => {
    if (!session) return;
    if (!cells.length) {
      toast("سلولی برای خروجی گرفتن نیست", "err");
      return;
    }
    const nb = cellsToNotebook(sortCells(cells));
    const blob = new Blob([JSON.stringify(nb, null, 1)], { type: "application/x-ipynb+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = notebookFileName(session.title, session.code);
    a.click();
    URL.revokeObjectURL(url);
    toast("خروجی ipynb دانلود شد", "ok");
  };

  const handleTeamChange = (team: CurrentTeam | null) => {
    if (!session) return;
    setCurrentTeam(team);
    if (team) storeTeam(session.id, team);
    else clearStoredTeam(session.id);
  };

  const unlockTeacherMode = async () => {
    if (!session) return;
    const h = await hashPin(pinInput);
    if (h === (await getClassAdminPinHash(session))) {
      setTeacherMode(true);
      setPinModalOpen(false);
      setPinInput("");
      // Persist so a page refresh keeps the teacher logged in.
      try {
        localStorage.setItem("teacherPin_" + session.code, h);
      } catch { /* ignore */ }
      toast("حالت معلم فعال شد", "ok");
    } else toast("رمز اشتباهه", "err");
  };

  const toggleTeacherMode = () => {
    // Teachers are already trusted — just flip the mode, no PIN needed.
    if (isTeacher) {
      const next = !teacherMode;
      setTeacherMode(next);
      toast(next ? "حالت معلم فعال شد" : "حالت معلم غیرفعال شد", next ? "ok" : "info");
      return;
    }
    if (teacherMode) {
      setTeacherMode(false);
      if (session) {
        try {
          localStorage.removeItem("teacherPin_" + session.code);
        } catch { /* ignore */ }
      }
      toast("حالت معلم غیرفعال شد", "info");
    } else setPinModalOpen(true);
  };

  const leaveClass = () => {
    if (!confirm("از کلاس خارج می‌شوی؟")) return;
    localStorage.removeItem("lastSessionCode");
    router.push("/");
  };

  const copy = (text: string, msg: string) => {
    navigator.clipboard.writeText(text);
    toast(msg, "ok");
  };

  // ---------- Early states ----------
  if (notFound) {
    return (
      <div className="min-h-screen grid place-items-center p-6 text-center">
        <div className="card p-10 max-w-sm anim-pop">
          <div className="flex justify-center text-primary mb-3">
            <Icon name="search" className="w-10 h-10" />
          </div>
          <h1 className="font-extrabold text-lg mb-2">کلاسی با این کد پیدا نشد</h1>
          <p className="text-sm text-muted mb-5">{loadError || "کد رو دوباره چک کن یا از معلمت بپرس."}</p>
          <Link href="/" className="btn-primary">
            بازگشت به صفحه اصلی
          </Link>
        </div>
      </div>
    );
  }

  if (!ready || !session) return <ClassPageSkeleton />;

  const compNeedsAttention = !!comp.item && !teacherMode && (!currentTeam || !comp.answered);
  const tabBase = "relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-bold whitespace-nowrap transition";

  return (
    <div className="min-h-screen pb-28">
      {/* ===== Top bar ===== */}
      <header className="sticky top-0 z-40 glass">
        <div className="max-w-4xl mx-auto px-4 pt-3 pb-2.5 flex items-center gap-2">
          <Link href="/" className="w-9 h-9 rounded-xl grid place-items-center text-white shadow-soft shrink-0" style={{ background: "var(--grad)" }} title="صفحه اصلی">
            <Icon name="terminal" className="w-5 h-5" />
          </Link>
          <button onClick={() => setShareOpen(true)} className="min-w-0 text-right group">
            <div className="font-extrabold text-sm truncate group-hover:text-primary transition">{session.title}</div>
            <div className="text-[11px] text-muted font-mono tracking-widest">کد: {session.code}</div>
          </button>
          <div className="flex-1" />

          <button
            onClick={() => setTeamPickerOpen(true)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border bg-white hover:shadow-soft transition"
            style={{ borderColor: currentTeam?.color || "#e2e8f0", color: currentTeam?.color || "#64748b" }}
          >
            {currentTeam ? (
              <>
                <span className="w-2 h-2 rounded-full" style={{ background: currentTeam.color }} />
                {currentTeam.name}
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="plus" className="w-3.5 h-3.5" /> انتخاب تیم
              </span>
            )}
          </button>

          <button
            onClick={toggleTeacherMode}
            title={isTeacher ? "حساب معلم — حالت خودکار فعال است (بدون رمز)" : "ورود به حالت معلم با رمز کلاس"}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition ${
              teacherMode ? "bg-amber-500 text-white shadow-soft" : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
            }`}
          >
            <Icon name="cap" className="w-4 h-4" />
            {teacherMode ? "خروج از معلم" : "معلم"}
          </button>

          <button
            onClick={() => setProfileOpen(true)}
            className={`flex items-center gap-2 pl-3 pr-1 py-1 rounded-full bg-white border hover:shadow-soft transition ${
              needsProfile ? "border-primary/40 ring-2 ring-primary/25" : "border-line"
            }`}
            title={needsProfile ? "نام و آواتارت را تنظیم کن" : "پروفایل"}
          >
            <span className="w-7 h-7 rounded-full bg-indigo-50 grid place-items-center text-base">{avatar}</span>
            <span className="text-xs font-bold max-w-[90px] truncate hidden sm:block">{displayName}</span>
          </button>
        </div>

        {/* Section nav */}
        <div className="max-w-4xl mx-auto px-4 pb-2.5 flex items-center gap-1.5 overflow-x-auto">
          <span className={`${tabBase} bg-indigo-50 text-primary`}>
            <Icon name="grid" className="w-4 h-4" /> سلول‌ها
          </span>
          <button onClick={() => setExercisesOpen(true)} className={`${tabBase} text-muted hover:bg-white hover:text-ink hover:shadow-soft`}>
            <Icon name="file" className="w-4 h-4" /> تمرین‌ها
            {exerciseBadge > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-danger text-white text-[10px] font-bold">{exerciseBadge}</span>
            )}
          </button>
          <button
            onClick={() => {
              setQuizFromBanner(false);
              setQuizzesOpen(true);
            }}
            className={`${tabBase} text-muted hover:bg-white hover:text-ink hover:shadow-soft`}
          >
            <Icon name="help" className="w-4 h-4" /> کوییز
            {teacherMode && quiz.draftCount > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-amber-500 text-white text-[10px] font-bold" title="پیش‌نویس">
                {quiz.draftCount}
              </span>
            )}
            {quiz.item && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
          </button>
          <button
            onClick={() => {
              setCompFromBanner(false);
              setCompetitionsOpen(true);
            }}
            className={`${tabBase} text-muted hover:bg-white hover:text-ink hover:shadow-soft`}
          >
            <Icon name="flag" className="w-4 h-4" /> مسابقه
            {teacherMode && comp.draftCount > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-amber-500 text-white text-[10px] font-bold" title="پیش‌نویس">
                {comp.draftCount}
              </span>
            )}
            {compNeedsAttention && (
              <span className="min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-danger text-white text-[10px] font-bold">!</span>
            )}
            {comp.item && !compNeedsAttention && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
          </button>
          <Link href="/battle" className={`${tabBase} text-muted hover:bg-white hover:text-ink hover:shadow-soft`}>
            <Icon name="zap" className="w-4 h-4" /> نبرد
          </Link>
          <button onClick={() => setTeamPickerOpen(true)} className={`${tabBase} text-muted hover:bg-white hover:text-ink hover:shadow-soft sm:hidden`}>
            <Icon name="users" className="w-4 h-4" /> {currentTeam ? currentTeam.name : "تیم"}
          </button>
        </div>
      </header>

      {teacherMode && (
        <div className="bg-gradient-to-l from-amber-400 to-orange-400 text-white text-center text-xs font-bold py-1.5 flex items-center justify-center gap-2">
          <Icon name="cap" className="w-4 h-4" />
          حالت معلم فعاله — همه‌ی سلول‌های کلاس رو می‌بینی و می‌تونی حذفشون کنی
        </div>
      )}

      {/* ===== Cells ===== */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div>
            <h2 className="font-extrabold text-lg">{teacherMode ? "همه‌ی سلول‌ها" : currentTeam ? `فضای تیم ${currentTeam.name}` : "سلول‌های شخصی من"}</h2>
            <p className="text-xs text-muted mt-0.5">{cells.length} سلول</p>
          </div>

          {teacherMode && (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                ref={nbFileRef}
                type="file"
                accept=".ipynb,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importNotebook(f);
                }}
              />
              <button
                onClick={() => nbFileRef.current?.click()}
                disabled={importingNb}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white border border-line hover:shadow-soft transition disabled:opacity-50"
                title="آپلود فایل ipynb داخل کلاس"
              >
                <Icon name="upload" className="w-4 h-4" />
                {importingNb ? "در حال خواندن…" : "آپلود ipynb"}
              </button>
              <button
                onClick={exportNotebook}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white shadow-soft transition"
                style={{ background: "var(--grad)" }}
                title="خروجی ipynb از کل سلول‌های کلاس"
              >
                <Icon name="download" className="w-4 h-4" />
                خروجی ipynb
              </button>
            </div>
          )}
        </div>

        <div>
          {loadingCells ? (
            <div className="space-y-4">
              <CellSkeleton />
              <CellSkeleton />
            </div>
          ) : cells.length === 0 ? (
            <div className="card text-center py-16 px-6 anim-pop">
              <div className="flex justify-center text-primary mb-3">
                <Icon name="sparkles" className="w-10 h-10" />
              </div>
              <h3 className="font-extrabold mb-1">آماده‌ای شروع کنی؟</h3>
              <p className="text-sm text-muted mb-5">یه سلول بساز و اولین کد پایتونت رو بنویس، یا به یه تیم بپیوند.</p>
              <div className="flex gap-2 justify-center flex-wrap">
                <button onClick={() => addCell()} className="btn-primary inline-flex items-center gap-1.5">
                  <Icon name="plus" className="w-4 h-4" /> سلول جدید
                </button>
                <button onClick={() => setTeamPickerOpen(true)} className="btn-ghost inline-flex items-center gap-1.5">
                  <Icon name="users" className="w-4 h-4" /> پیوستن به تیم
                </button>
              </div>
            </div>
          ) : (
            <>
              <InsertDivider onClick={() => addCell(null)} label="سلول جدید در ابتدا" />
              {cells.map((cell) => (
                <Fragment key={cell.id}>
                  <div id={"cell-" + cell.id} className={`scroll-mt-40 rounded-2xl ${flashId === cell.id ? "cell-flash" : ""}`}>
                    <CodeCell
                      cell={cell}
                      teacherMode={teacherMode}
                      authorAvatar={authorAvatars[cell.author_id] || null}
                      autoFocus={focusedCellId === cell.id}
                      onDeleted={(id) => setCells((p) => p.filter((c) => c.id !== id))}
                    />
                  </div>
                  <InsertDivider onClick={() => addCell(cell.id)} />
                </Fragment>
              ))}
            </>
          )}
        </div>
      </main>

      {/* ===== Floating "new cell" button ===== */}
      <button
        onClick={() => addCell()}
        className="fixed bottom-4 left-4 z-[80] btn-primary !rounded-full !px-5 !py-3.5 shadow-glow inline-flex items-center gap-2"
        aria-label="سلول جدید"
        title="سلول جدید در انتها"
      >
        <Icon name="plus" className="w-5 h-5" />
        <span className="hidden sm:inline">سلول جدید</span>
      </button>

      {/* ===== Team chat ===== */}
      {currentTeam && !teacherMode && <TeamChat classId={session.id} team={currentTeam} />}

      {/* ===== Live banners ===== */}
      {quiz.item && !teacherMode && !quizzesOpen && (
        <LiveBanner
          icon={<Icon name="help" className="w-4 h-4" />}
          title={quiz.item.title}
          remaining={quiz.remaining}
          status={quiz.answered ? "✓ پاسخ دادی" : "▶ کلیک کن"}
          onClick={() => {
            setQuizFromBanner(true);
            setQuizzesOpen(true);
          }}
        />
      )}
      {comp.item && !teacherMode && !competitionsOpen && (
        <LiveBanner
          icon={<Icon name="flag" className="w-4 h-4" />}
          title={comp.item.title}
          remaining={comp.remaining}
          status={!currentTeam ? "⚠ اول تیم انتخاب کن" : comp.answered ? "✓ پاسخ تیم ثبت شد" : "▶ کلیک کن"}
          offset={quiz.item && !quizzesOpen ? 56 : 0}
          onClick={() => {
            setCompFromBanner(true);
            setCompetitionsOpen(true);
          }}
        />
      )}

      {/* ===== Modals ===== */}
      {exercisesOpen && (
        <ExercisesModal
          classId={session.id}
          teacherMode={teacherMode}
          onClose={() => {
            setExercisesOpen(false);
            loadExerciseBadge();
          }}
        />
      )}
      {quizzesOpen && (
        <QuizzesModal
          classId={session.id}
          teacherMode={teacherMode}
          initialTakeActive={quizFromBanner}
          onClose={() => {
            setQuizzesOpen(false);
            quiz.reload();
          }}
        />
      )}
      {competitionsOpen && (
        <CompetitionsModal
          classId={session.id}
          teacherMode={teacherMode}
          currentTeam={currentTeam}
          initialTakeActive={compFromBanner}
          onNeedTeam={() => setTeamPickerOpen(true)}
          onClose={() => {
            setCompetitionsOpen(false);
            comp.reload();
          }}
        />
      )}

      {/* Opened only when the user asks for it (the avatar button). */}
      <ProfileModal open={profileOpen} firstTime={needsProfile} onClose={() => setProfileOpen(false)} />
      <TeamPicker
        open={teamPickerOpen}
        onClose={() => setTeamPickerOpen(false)}
        classId={session.id}
        currentTeam={currentTeam}
        onTeamChange={handleTeamChange}
      />

      {shareOpen && (
        <div
          className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm anim-fade flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setShareOpen(false)}
        >
          <div className="bg-white rounded-2xl shadow-2xl anim-pop w-full max-w-sm p-6">
            <div className="text-center mb-5">
              <div className="w-14 h-14 mx-auto rounded-2xl grid place-items-center text-white shadow-glow mb-3" style={{ background: "var(--grad)" }}>
                <Icon name="school" className="w-7 h-7" />
              </div>
              <h2 className="font-extrabold">{session.title}</h2>
              <p className="text-xs text-muted mt-1">کد یا لینک رو برای دانشجوها بفرست</p>
            </div>
            <div className="text-center text-3xl font-extrabold tracking-[0.35em] grad-text py-2 mb-3">{session.code}</div>
            <div className="flex gap-2 mb-2">
              <button onClick={() => copy(session.code, "کد کپی شد")} className="btn-ghost flex-1">
                کپی کد
              </button>
              <button onClick={() => copy(`${window.location.origin}/class/${session.code}`, "لینک کپی شد")} className="btn-primary flex-1">
                کپی لینک
              </button>
            </div>
            <button onClick={leaveClass} className="w-full mt-3 py-2 text-sm font-bold text-danger hover:bg-red-50 rounded-xl transition">
              خروج از کلاس
            </button>
          </div>
        </div>
      )}

      {pinModalOpen && (
        <div
          className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm anim-fade flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setPinModalOpen(false)}
        >
          <div className="bg-white rounded-2xl shadow-2xl anim-pop w-full max-w-xs p-6 text-center">
            <div className="flex justify-center text-primary mb-2">
              <Icon name="lock" className="w-8 h-8" />
            </div>
            <h2 className="font-extrabold mb-1">حالت معلم</h2>
            <p className="text-xs text-muted mb-4">رمز مدیریتی که موقع ساخت کلاس گذاشتی رو وارد کن</p>
            <input
              type="password"
              autoFocus
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && unlockTeacherMode()}
              className="w-full border border-line rounded-xl px-3 py-2.5 mb-3 text-center outline-none focus:border-primary"
              placeholder="رمز عبور"
            />
            <button onClick={unlockTeacherMode} className="btn-primary w-full inline-flex items-center justify-center gap-1.5">
              <Icon name="lock" className="w-4 h-4" /> ورود
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
