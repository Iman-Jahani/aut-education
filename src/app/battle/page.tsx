"use client";

// ⚔️ Code Battle lobby: quick match / create room / join by code, the waiting
// room and (once both players are ready) the arena. State is polled every 2s
// because Supabase Realtime is usually blocked from Iran.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ToastProvider";
import Icon from "@/components/Icon";
import BattleArena from "@/components/BattleArena";
import { faNum } from "@/lib/auth";
import { listJoinedClasses, type JoinedClass } from "@/lib/joinedClasses";
import { BATTLE_TIME_OPTIONS, MAX_BATTLES_PER_DAY, battleApi, battleAction, battleHome, postBattle } from "@/lib/battle";
import type { Battle, BattleStats, Exercise } from "@/lib/types";

const CODE_LEN = 6;

export default function BattlePage() {
  const { user, ready, displayName, avatar } = useAuth();
  const toast = useToast();

  const [classes, setClasses] = useState<JoinedClass[]>([]);
  const [classId, setClassId] = useState("");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [exerciseId, setExerciseId] = useState("");
  const [timeLimit, setTimeLimit] = useState(300);
  const [battle, setBattle] = useState<Battle | null>(null);
  const [stats, setStats] = useState<BattleStats | null>(null);
  const [queued, setQueued] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  // ---- joined classes (localStorage) ----
  useEffect(() => {
    if (!ready) return;
    const mine = listJoinedClasses();
    setClasses(mine);
    if (mine[0] && !classId) setClassId(mine[0].id);
  }, [ready, classId]);

  // ---- exercises of the selected class (teacher loader) ----
  useEffect(() => {
    if (!classId) return setExercises([]);
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("exercises")
        .select("*")
        .eq("class_id", classId)
        .order("created_at", { ascending: false });
      if (alive) {
        setExercises((data as Exercise[] | null) || []);
        setExerciseId("");
      }
    })();
    return () => {
      alive = false;
    };
  }, [classId]);

  // ---- polling: resume an existing battle + refresh stats ----
  const refresh = useCallback(async () => {
    const r = await battleHome();
    if (!r.ok || !r.data) return;
    setBattle(r.data.battle ?? null);
    setStats(r.data.stats ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 2000);
    return () => clearInterval(t);
  }, [refresh]);

  // ---- actions ----
  const quickMatch = async () => {
    if (!classId) return toast("اول یک کلاس انتخاب کن", "err");
    setBusy(true);
    try {
      const r = await postBattle<{ battle?: Battle; queued?: boolean }>({ action: "quick", class_id: classId });
      if (!r.ok) return toast(r.data?.error || "خطا در نبرد سریع", "err");
      if (r.data?.queued) {
        setQueued(true);
        toast("در صف انتظار گذاشتی… دنبال حریف می‌گردیم", "info");
      } else if (r.data?.battle) {
        setQueued(false);
        setBattle(r.data.battle);
        toast("حریف پیدا شد! ⚔️", "ok");
      }
    } finally {
      setBusy(false);
    }
  };

  const createRoom = async () => {
    if (!classId) return toast("اول یک کلاس انتخاب کن", "err");
    setBusy(true);
    try {
      const r = await postBattle({
        action: "create",
        class_id: classId,
        time_limit: timeLimit,
        exercise_id: exerciseId || undefined,
      });
      if (!r.ok || !r.data?.battle) return toast(r.data?.error || "ساخت اتاق ناموفق بود", "err");
      setBattle(r.data.battle);
      toast(`اتاق ساخته شد — کد: ${r.data.battle.room_code}`, "ok");
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = async () => {
    const code = roomCode.trim().toUpperCase();
    if (code.length !== CODE_LEN) return toast(`کد اتاق ${faNum(CODE_LEN)} کاراکتری است`, "err");
    setBusy(true);
    try {
      const r = await postBattle({ action: "join", room_code: code });
      if (!r.ok || !r.data?.battle) return toast(r.data?.error || "ورود ناموفق بود", "err");
      setBattle(r.data.battle);
      setRoomCode("");
      toast("به اتاق وارد شدی", "ok");
    } finally {
      setBusy(false);
    }
  };

  const leaveQueue = async () => {
    await battleApi("/api/battle", { method: "POST", body: JSON.stringify({ action: "leave" }) });
    setQueued(false);
  };

  const cancelRoom = async () => {
    if (!battle) return;
    await battleAction(battle.id, { action: "cancel" });
    setBattle(null);
    toast("اتاق لغو شد", "info");
  };

  const markReady = async () => {
    if (!battle) return;
    const r = await battleAction<{ battle: Battle }>(battle.id, { action: "ready" });
    if (!r.ok || !r.data?.battle) return toast(r.data?.error || "خطا", "err");
    setBattle(r.data.battle);
  };

  const isHost = !!battle && !!user && battle.host_id === user.id;
  const iAmReady = !!battle && (isHost ? battle.host_ready : battle.guest_ready);
  const showArena = !!battle && (battle.status === "active" || battle.status === "finished");

  if (!ready || loading) {
    return (
      <div className="min-h-screen max-w-3xl mx-auto px-6 py-10 space-y-4">
        <div className="skeleton h-24 rounded-2xl" />
        <div className="skeleton h-40 rounded-2xl" />
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="min-h-screen pb-20">
      <nav className="sticky top-0 z-40 glass px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link href="/" className="font-extrabold text-ink flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl grid place-items-center text-white shadow-glow" style={{ background: "var(--grad)" }}>
              <Icon name="zap" className="w-5 h-5" />
            </span>
            <span className="hidden sm:inline">نبرد برنامه‌نویسی</span>
          </Link>
          <div className="flex-1" />
          <Link href="/dashboard" className="btn-ghost hidden sm:inline-flex">
            داشبورد من
          </Link>
          <span className="flex items-center gap-2 pl-3 pr-1.5 py-1 bg-white border border-line rounded-full text-xs font-bold">
            <span className="w-6 h-6 rounded-full bg-indigo-50 grid place-items-center">{avatar}</span>
            {displayName || "دانشجو"}
          </span>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-5">
        {/* ===== Arena ===== */}
        {showArena && battle ? (
          <BattleArena battleId={battle.id} onExit={() => setBattle(null)} />
        ) : battle ? (
          /* ===== Waiting room ===== */
          <div className="space-y-4">
            <div className="card p-6 text-center">
              <div className="text-4xl mb-2">⚔️</div>
              <h1 className="font-extrabold text-lg mb-1">اتاق انتظار</h1>
              <p className="text-xs text-muted mb-4">
                این کد را برای حریفت بفرست — {faNum(Math.round(battle.time_limit / 60))} دقیقه روی تمرین{" "}
                {battle.exercise_id ? "انتخاب‌شده" : "(تصادفی)"} وقت دارید
              </p>
              <div className="text-3xl font-extrabold tracking-[0.3em] font-mono grad-text py-2 mb-3" dir="ltr">
                {battle.room_code}
              </div>
              <div className="flex gap-2 justify-center flex-wrap">
                <button
                  onClick={() => void navigator.clipboard?.writeText(battle.room_code)}
                  className="btn-ghost"
                >
                  <Icon name="copy" className="w-4 h-4" /> کپی کد
                </button>
                <button
                  onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}/battle`)}
                  className="btn-ghost"
                >
                  <Icon name="link" className="w-4 h-4" /> کپی لینک
                </button>
              </div>
            </div>

            <div className="card p-5 space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-indigo-50 grid place-items-center text-xl">{avatar}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-extrabold truncate">شما {isHost ? "(میزبان)" : ""}</div>
                  <div className="text-[11px] text-muted">{iAmReady ? "آماده‌ام ✓" : "در انتظار آماده شدن"}</div>
                </div>
                {iAmReady && <Icon name="checkCircle" className="w-5 h-5 text-emerald-500" />}
              </div>
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-violet-50 grid place-items-center text-xl">
                  {battle.guest_id || !isHost ? "🙋" : "❓"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-extrabold truncate">
                    {battle.guest_id ? "حریف" : "در انتظار ورود حریف…"}
                  </div>
                  <div className="text-[11px] text-muted">
                    {battle.guest_id
                      ? (isHost ? battle.guest_ready : battle.host_ready)
                        ? "آماده است ✓"
                        : "وارد شد، هنوز آماده نیست"
                      : "کد اتاق را برایش بفرست"}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <button onClick={() => void markReady()} disabled={iAmReady} className="btn-primary flex-1">
                <Icon name="check" className="w-4 h-4" /> {iAmReady ? "آماده‌ام ✓" : "آماده‌ام!"}
              </button>
              <button onClick={() => void cancelRoom()} className="btn-ghost">
                لغو اتاق
              </button>
            </div>
            <p className="text-[11px] text-muted text-center">
              وقتی هر دو آماده شوید، شمارش ۳-۲-۱ شروع می‌شود
            </p>
          </div>
        ) : (
          /* ===== Lobby ===== */
          <div className="space-y-4">
            <div className="card p-5">
              <h1 className="font-extrabold text-lg mb-1 flex items-center gap-2">
                <Icon name="zap" className="w-5 h-5 text-primary" /> نبرد ۱ به ۱
              </h1>
              <p className="text-xs text-muted mb-4">
                همزمان یک تمرین را حل کنید؛ هر کی زودتر یا کامل‌تر پاس کند برنده است. سقف{" "}
                {faNum(MAX_BATTLES_PER_DAY)} نبرد در ۲۴ ساعت.
              </p>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { n: stats?.played ?? 0, t: "نبرد" },
                  { n: stats?.wins ?? 0, t: "برد" },
                  { n: stats?.draws ?? 0, t: "مساوی" },
                  { n: stats?.xp ?? 0, t: "XP" },
                ].map((x) => (
                  <div key={x.t} className="rounded-xl bg-slate-50 border border-line py-2">
                    <div className="font-extrabold">{faNum(x.n)}</div>
                    <div className="text-[10px] text-muted">{x.t}</div>
                  </div>
                ))}
              </div>
            </div>

            {classes.length === 0 ? (
              <div className="card p-8 text-center text-sm text-muted">
                برای نبرد باید عضو یک کلاس باشی — از{" "}
                <Link href="/dashboard" className="text-primary font-bold">
                  داشبورد
                </Link>{" "}
                با کد کلاس وارد شو.
              </div>
            ) : (
              <>
                <div className="card p-5 space-y-3">
                  <div>
                    <label className="text-xs font-bold text-muted block mb-1">کلاس</label>
                    <select
                      value={classId}
                      onChange={(e) => setClassId(e.target.value)}
                      className="w-full border border-line rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary"
                    >
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title} ({c.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted block mb-1">
                      تمرین (خالی بگذاری، تصادفی انتخاب می‌شود)
                    </label>
                    <select
                      value={exerciseId}
                      onChange={(e) => setExerciseId(e.target.value)}
                      className="w-full border border-line rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary"
                    >
                      <option value="">تصادفی</option>
                      {exercises.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted block mb-1">زمان نبرد</label>
                    <div className="flex gap-2">
                      {BATTLE_TIME_OPTIONS.map((o) => (
                        <button
                          key={o.seconds}
                          onClick={() => setTimeLimit(o.seconds)}
                          className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold border transition ${
                            timeLimit === o.seconds
                              ? "border-primary bg-indigo-50 text-primary"
                              : "border-line bg-white text-muted"
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ===== سه روش شروع ===== */}
                <div className="grid sm:grid-cols-3 gap-3">
                  <button
                    onClick={() => void quickMatch()}
                    disabled={busy || queued}
                    className="card p-5 text-center hover:shadow-lift hover:-translate-y-0.5 transition disabled:opacity-60"
                  >
                    <div className="text-3xl mb-1">⚡</div>
                    <div className="font-extrabold text-sm">نبرد سریع</div>
                    <div className="text-[11px] text-muted mt-1">حریف تصادفی از صف</div>
                  </button>
                  <button
                    onClick={() => void createRoom()}
                    disabled={busy}
                    className="card p-5 text-center hover:shadow-lift hover:-translate-y-0.5 transition disabled:opacity-60"
                  >
                    <div className="text-3xl mb-1">🎟️</div>
                    <div className="font-extrabold text-sm">ساخت اتاق</div>
                    <div className="text-[11px] text-muted mt-1">کد ۶ رقمی برای حریف</div>
                  </button>
                  <div className="card p-5 text-center">
                    <div className="text-3xl mb-1">🎯</div>
                    <div className="font-extrabold text-sm mb-2">ورود با کد</div>
                    <div className="flex gap-1.5">
                      <input
                        value={roomCode}
                        onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LEN))}
                        onKeyDown={(e) => e.key === "Enter" && void joinRoom()}
                        placeholder="ABC123"
                        maxLength={CODE_LEN}
                        dir="ltr"
                        className="w-full border border-line rounded-xl px-3 py-2 text-center font-mono tracking-widest text-sm outline-none focus:border-primary"
                      />
                      <button onClick={() => void joinRoom()} disabled={busy} className="btn-primary !px-3">
                        ورود
                      </button>
                    </div>
                  </div>
                </div>

                {queued && (
                  <div className="card p-5 text-center">
                    <span className="inline-block w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2" />
                    <div className="text-sm font-bold">دنبال حریف می‌گردیم…</div>
                    <p className="text-[11px] text-muted mb-3">به محض پیدا شدن، خودکار وارد میدان می‌شوی</p>
                    <button onClick={() => void leaveQueue()} className="btn-ghost">
                      لغو صف
                    </button>
                  </div>
                )}
              </>
            )}

            <div className="card p-5 text-xs leading-6 text-muted space-y-1">
              <div>• کد اتاق را با هم‌کلاسی‌هایت به اشتراک بگذار (کد = کلید ورود).</div>
              <div>• با یک حریف، حداقل ۱ ساعت بین دو نبرد فاصله است.</div>
              <div>• اگر حریف ۶۰ ثانیه قطع بماند، نبرد به نفع تو تمام می‌شود.</div>
              <div>• کد تو در مرورگر با Pyodide اجرا می‌شود؛ فقط نتیجه به سرور می‌رود.</div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
