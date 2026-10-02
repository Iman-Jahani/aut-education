"use client";

// ⚔️ 1v1 Battle arena — stays mounted for the whole round.
// Polling every 2s (Realtime is usually blocked from IR), Pyodide runs the
// code locally and only (passed, total, results) go to the server.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { dracula } from "@uiw/codemirror-theme-dracula";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ToastProvider";
import Icon from "@/components/Icon";
import { noPaste } from "@/lib/editor";
import { runTestCases, type TestRunResult } from "@/lib/pyodide";
import { faNum } from "@/lib/auth";
import { battleAction, battleBeep, battleClock, battleState } from "@/lib/battle";
import { ProgressBar } from "@/components/Charts";
import type { Battle, BattlePlayer, BattleStateResponse } from "@/lib/types";

export default function BattleArena({ battleId, onExit }: { battleId: string; onExit: () => void }) {
  const { user, displayName } = useAuth();
  const toast = useToast();
  const [state, setState] = useState<BattleStateResponse | null>(null);
  const [code, setCode] = useState("");
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [finalDone, setFinalDone] = useState(false);
  const [results, setResults] = useState<TestRunResult[] | null>(null);
  const codeRef = useRef("");
  codeRef.current = code;
  const lastSentRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const extensions = useMemo(
    () => [python(), noPaste(() => toast("پیست کردن در نبرد غیرفعاله", "err"))],
    [toast]
  );

  // ---- 2s polling (Realtime is usually blocked, so we poll) ----
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const fetchState = async () => {
      const s = await battleState(battleId);
      if (alive && s.ok && s.data) setState(s.data);
    };
    void fetchState().then(() => {
      if (alive) timer = setInterval(() => void fetchState(), 2000);
    });
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [battleId]);

  // ---- countdown beep (3 → 520Hz, 1 → 880Hz longer) ----
  const countdownN = state && state.countdownMs > 0 ? Math.ceil(state.countdownMs / 1000) : 0;
  const lastCount = useRef(0);
  useEffect(() => {
    if (countdownN > 0 && countdownN !== lastCount.current) {
      lastCount.current = countdownN;
      battleBeep(countdownN === 1 ? 880 : 520, countdownN === 1 ? 320 : 140);
    }
    if (countdownN === 0) lastCount.current = 0;
  }, [countdownN]);

  const battle: Battle | null = state?.battle ?? null;
  const me: BattlePlayer | null = state?.me ?? null;
  const opp: BattlePlayer | null = state?.opponent ?? null;

  const tests = useMemo(() => {
    const tc = state?.exercise?.test_cases;
    return Array.isArray(tc) && tc.length ? tc : [{ input: "", expected: "" }];
  }, [state]);

  // ---- run locally, send only the result to the server ----
  const sendProgress = useCallback(
    async (nextCode: string, final: boolean) => {
      if (!user || !battle || battle.status !== "active") return;
      try {
        const r = await runTestCases(nextCode, tests);
        const passed = r.filter((x) => x.passed).length;
        const total = r.length;
        setResults(r);
        const key = `${passed}/${total}/${final ? "f" : "p"}`;
        if (lastSentRef.current === key && !final) return;
        lastSentRef.current = key;
        const s = await battleAction(battle.id, {
          action: "submit", code: nextCode, passed_tests: passed,
          total_tests: total, test_results: r, is_final: final,
        });
        if (!s.ok) toast(s.data?.error || "ثبت نتیجه ناموفق بود", "err");
        if (final) setFinalDone(true);
        const st = await battleState(battle.id);
        if (st.ok && st.data) setState(st.data);
      } catch (e) {
        toast("خطا در اجرا: " + (e as Error).message, "err");
      }
    },
    [user, battle, tests, toast]
  );

  const runOnly = useCallback(async () => {
    if (!user || running) return;
    setRunning(true);
    try {
      const r = await runTestCases(codeRef.current, tests);
      setResults(r);
      const passed = r.filter((x) => x.passed).length;
      toast(`${faNum(passed)} از ${faNum(r.length)} تست پاس شد`, passed === r.length ? "ok" : "info");
    } catch (e) {
      toast("خطا در اجرا: " + (e as Error).message, "err");
    } finally {
      setRunning(false);
    }
  }, [user, tests, toast, running]);

  // Debounced autosend while typing (progress for the opponent).
  useEffect(() => {
    if (!battle || battle.status !== "active" || countdownN > 0) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void sendProgress(codeRef.current, false);
    }, 1500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, battle?.status]);

  const submitFinal = useCallback(async () => {
    if (submitting || finalDone) return;
    setSubmitting(true);
    try {
      await sendProgress(codeRef.current, true);
      toast("ارسال نهایی ثبت شد", "ok");
    } finally {
      setSubmitting(false);
    }
  }, [submitting, finalDone, sendProgress]);

  const rematch = useCallback(async () => {
    const r = await battleAction(battleId, { action: "rematch" });
    if (!r.ok) {
      toast(r.data?.error || "خطا", "err");
      return;
    }
    setFinalDone(false);
    setResults(null);
    setCode("");
    lastSentRef.current = "";
    const st = await battleState(battleId);
    if (st.ok && st.data) setState(st.data);
  }, [battleId, toast]);

  if (!state || !battle) {
    return (
      <div className="card p-10 text-center text-sm text-muted">
        <Icon name="zap" className="w-8 h-8 mx-auto mb-2 text-primary anim-float" />
        در حال اتصال به نبرد…
      </div>
    );
  }

  // نبردی که تمرین ندارد (کلاس هنوز تمرینی ندارد) → به‌جای ادیتور خالی، پیام روشن
  if (!state.exercise) {
    return (
      <div className="card p-10 text-center">
        <Icon name="alert" className="w-8 h-8 mx-auto mb-3 text-amber-500" />
        <p className="text-sm font-bold mb-1">این نبرد تمرینی ندارد</p>
        <p className="text-xs text-muted mb-4">معلم برای این کلاس تمرین نساخته است؛ با کد جدید دوباره امتحان کن.</p>
        <button onClick={onExit} className="btn-ghost">
          بازگشت به لابی
        </button>
      </div>
    );
  }

  const finished = battle.status === "finished";
  const outcome = state.outcome;
  const mePct = me && me.total > 0 ? Math.round((me.passed / me.total) * 100) : 0;
  const oppPct = opp && opp.total > 0 ? Math.round((opp.passed / opp.total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* ===== header: timer + players ===== */}
      <div className="card p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="w-9 h-9 rounded-full bg-indigo-50 grid place-items-center text-xl shrink-0">{me?.avatar || "👤"}</span>
            <div className="min-w-0">
              <div className="text-sm font-extrabold truncate">{me?.name || displayName}</div>
              <div className="text-[11px] text-muted">شما · {faNum(me?.passed ?? 0)}/{faNum(me?.total ?? 0)} تست</div>
            </div>
          </div>
          <div className="text-center shrink-0">
            <div className={`font-extrabold text-2xl font-mono ${state.remainingMs < 60000 ? "text-danger" : "text-ink"}`} dir="ltr">
              {battleClock(state.remainingMs)}
            </div>
            <div className="text-[10px] text-muted">زمان باقی‌مانده</div>
          </div>
          <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
            <div className="min-w-0 text-left">
              <div className="text-sm font-extrabold truncate">{opp ? opp.name : "در انتظار حریف…"}</div>
              <div className="text-[11px] text-muted">
                {opp ? `${faNum(opp.passed)}/${faNum(opp.total)} تست${opp.connected ? "" : " · قطع"}` : "…"}
              </div>
            </div>
            <span className="w-9 h-9 rounded-full bg-violet-50 grid place-items-center text-xl shrink-0">{opp?.avatar || "❓"}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <ProgressBar value={me?.passed ?? 0} max={Math.max(me?.total ?? 0, 1)} label={`شما ${faNum(mePct)}٪`} tone="emerald" showValue={false} />
          <ProgressBar value={opp?.passed ?? 0} max={Math.max(opp?.total ?? 0, 1)} label={`حریف ${faNum(oppPct)}٪`} tone="amber" showValue={false} />
        </div>
      </div>

      {/* ===== ۳-۲-۱ شمارش معکوس ===== */}
      {countdownN > 0 && !finished && (
        <div className="card p-10 text-center anim-pop">
          <div className="text-6xl font-extrabold grad-text" key={countdownN}>
            {faNum(countdownN)}
          </div>
          <p className="text-sm text-muted mt-2">
            آماده باش… تمرین: {state.exercise?.title || "بدون تمرین"}
          </p>
          <p className="text-[11px] text-muted mt-1">زمان بعد از «۱» شروع می‌شود</p>
        </div>
      )}

      {/* ===== editors ===== */}
      {!finished && countdownN === 0 && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-line flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-indigo-50 grid place-items-center text-lg">{me?.avatar || "👤"}</span>
              <div className="font-extrabold text-sm">کد من</div>
              <div className="flex-1" />
              <button onClick={() => void runOnly()} disabled={running} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white disabled:opacity-50">
                <Icon name="play" className="w-3.5 h-3.5" /> {running ? "در حال اجرا…" : "تست"}
              </button>
              <button onClick={() => void submitFinal()} disabled={submitting || finalDone} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-soft disabled:opacity-50" style={{ background: "var(--grad)" }}>
                <Icon name="send" className="w-3.5 h-3.5" /> {finalDone ? "ارسال شد ✓" : "ارسال نهایی"}
              </button>
            </div>
            <div dir="ltr">
              <CodeMirror
                value={code}
                onChange={setCode}
                theme={dracula}
                extensions={extensions}
                minHeight="280px"
                maxHeight="480px"
                basicSetup={{ lineNumbers: true, autocompletion: true }}
                autoFocus
              />
            </div>
            {results && (
              <div className="border-t border-line px-4 py-3 space-y-1.5 max-h-44 overflow-y-auto" dir="ltr">
                {results.map((r, i) => (
                  <div key={i} className={`text-[11px] font-mono text-left rounded-lg px-2.5 py-1.5 ${r.passed ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
                    تست {i + 1}: {r.passed ? "✓" : "✗"} {r.error || r.actual}
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted px-4 pb-3">
              نتیجه به‌صورت خودکار برای حریف ارسال می‌شود · «ارسال نهایی» = اعلام پایان از طرف تو
            </p>
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-line flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-violet-50 grid place-items-center text-lg">{opp?.avatar || "❓"}</span>
              <div className="font-extrabold text-sm">حریف</div>
              <div className="flex-1" />
              {!opp?.connected && <span className="text-[10px] font-bold text-danger">قطع ارتباط</span>}
            </div>
            <div className="p-6 text-center">
              <div className="text-4xl font-extrabold mb-1">
                {faNum(opp?.passed ?? 0)}{opp ? `/${faNum(opp.total)}` : ""}
              </div>
              <div className="text-xs text-muted mb-4">تست پاس‌شده‌ی حریف</div>
              <ProgressBar value={opp?.passed ?? 0} max={Math.max(opp?.total ?? 0, 1)} tone="amber" showValue={false} />
              <div className="text-[11px] text-muted mt-3">
                {opp?.isFinal ? "حریف ارسال نهایی زده" : "نتیجه هر ۲ ثانیه به‌روز می‌شود"}
              </div>
            </div>
            <div className="px-4 pb-4">
              <div className="rounded-xl bg-slate-50 border border-line p-3 text-xs leading-6 text-muted">
                💡 {state.exercise?.description || state.exercise?.title}
                {state.exercise?.hint ? (
                  <>
                    <br />🛈 راهنمایی: {state.exercise.hint}
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== result ===== */}
      {finished && (
        <div className="card p-8 text-center anim-pop">
          <div className="text-5xl mb-3">{outcome === "win" ? "🏆" : outcome === "lose" ? "😞" : "🤝"}</div>
          <h2 className="font-extrabold text-xl mb-1">
            {outcome === "win" ? "بردی!" : outcome === "lose" ? "باختی!" : "مساوی!"}
          </h2>
          <p className="text-sm text-muted mb-4">
            تو {faNum(me?.passed ?? 0)}/{faNum(me?.total ?? 0)} · حریف {faNum(opp?.passed ?? 0)}/{faNum(opp?.total ?? 0)}
          </p>
          <div className="flex gap-2 justify-center flex-wrap">
            <button onClick={() => void rematch()} className="btn-primary">
              <Icon name="refresh" className="w-4 h-4" /> نبرد دوباره
            </button>
            <button onClick={onExit} className="btn-ghost">
              بازگشت به لابی
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
