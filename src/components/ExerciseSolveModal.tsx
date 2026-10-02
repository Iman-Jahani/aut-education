"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { dracula } from "@uiw/codemirror-theme-dracula";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ToastProvider";
import { runTestCases, type TestRunResult } from "@/lib/pyodide";
import { noPaste } from "@/lib/editor";
import { ListSkeleton } from "@/components/Skeleton";
import Icon from "@/components/Icon";
import type { Exercise, ExerciseSubmission } from "@/lib/types";

export default function ExerciseSolveModal({
  exercise,
  mySubmission,
  onClose,
  onSubmitted,
}: {
  exercise: Exercise;
  mySubmission?: ExerciseSubmission;
  onClose: () => void;
  onSubmitted: (sub: ExerciseSubmission) => void;
}) {
  const { user, displayName } = useAuth();
  const toast = useToast();
  const draftKey = `exercise_draft_${exercise.id}`;
  const [code, setCode] = useState(
    () => mySubmission?.code || (typeof window !== "undefined" ? localStorage.getItem(draftKey) : "") || ""
  );
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<TestRunResult[] | null>(null);
  const [summary, setSummary] = useState<{ passed: number; total: number; status: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const extensions = useMemo(() => [python(), noPaste(() => toast("پیست کردن غیرفعاله", "err"))], [toast]);

  // ── AI Tutor ──────────────────────────────────────────────────────────
  const [aiLoading, setAiLoading] = useState(false);
  const [aiHint, setAiHint] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiHistory, setAiHistory] = useState<{ ai_response: string; created_at: string; user_message: string | null }[]>([]);
  const [showAiHistory, setShowAiHistory] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);

  useEffect(() => {
    // load recent hints for this exercise
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/ai-hint?exercise_id=${encodeURIComponent(exercise.id)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.hints)) setAiHistory(data.hints);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [exercise.id]);

  const askAi = async () => {
    if (aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/ai-hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exercise_id: exercise.id,
          code,
          user_message: aiQuestion.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // `detail` carries the provider message (retired model, bad key, …);
        // it is only shown outside production so the classroom UI stays clean.
        const detail = process.env.NODE_ENV !== "production" && data?.detail ? `\n${data.detail}` : "";
        setAiError((data?.error || `خطا (${res.status})`) + detail);
        return;
      }
      // NOTE: the route answers with `{ response }` — older builds used `hint`,
      // so both are accepted (reading only `hint` left the panel empty).
      const hint = String(data?.response ?? data?.hint ?? "").trim();
      if (!hint) {
        setAiError("جوابی از سرور برنگشت — چند ثانیه بعد دوباره «گیر کردم» را بزن.");
        return;
      }
      setAiHint(hint);
      setShowAiPanel(true);
      setAiHistory((prev) => [{ ai_response: hint, created_at: new Date().toISOString(), user_message: aiQuestion.trim() || null }, ...prev].slice(0, 10));
      setAiQuestion("");
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, code);
      } catch {
        /* ignore */
      }
    }, 500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [code, draftKey]);

  const tests = exercise.test_cases?.length ? exercise.test_cases : [{ input: "", expected: "" }];

  const run = async () => {
    if (!user) return;
    setRunning(true);
    setResults(null);
    try {
      const r = await runTestCases(code, tests);
      setResults(r);
      const passed = r.filter((x) => x.passed).length;
      const total = r.length;
      const status = passed === total ? "correct" : passed > 0 ? "partial" : "wrong";
      setSummary({ passed, total, status });

      const payload: ExerciseSubmission = {
        exercise_id: exercise.id,
        user_id: user.id,
        author_name: displayName,
        code,
        output: r.map((x) => x.actual).join("\n---\n"),
        status: status as ExerciseSubmission["status"],
        score: total > 0 ? Math.round((passed / total) * 100) : 0,
        passed_tests: passed,
        total_tests: total,
        test_results: r,
        submitted_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("exercise_submissions")
        .upsert(payload, { onConflict: "exercise_id,user_id" });
      if (error) toast("خطا: " + error.message, "err");
      else {
        onSubmitted(payload);
        if (status === "correct") toast("پاس شد!", "ok");
        else if (status === "partial") toast(`${passed} از ${total}`, "info");
      }
    } catch (e) {
      toast("خطا در اجرا: " + (e as Error).message, "err");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-slate-900/50 backdrop-blur-sm anim-fade flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl anim-pop w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h2 className="font-extrabold inline-flex items-center gap-2">
            <Icon name="file" className="w-5 h-5" /> {exercise.title}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-ink inline-flex items-center" aria-label="بستن">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4 flex-1 space-y-4">
          {exercise.description && <p className="text-sm text-ink/80 whitespace-pre-wrap">{exercise.description}</p>}
          <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 text-xs text-indigo-900 flex items-center gap-2">
            <Icon name="target" className="w-4 h-4 shrink-0" /> {tests.length} تست — کدت باید برای همه‌ی ورودی‌ها خروجی درست بده
          </div>
          {exercise.hint && (
            <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs text-amber-900">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="bulb" className="w-4 h-4" /> <b>راهنمایی:</b>
              </span>{" "}
              {exercise.hint}
            </div>
          )}

          {/* ── AI Tutor trigger ─────────────────────────────────────── */}
          <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={askAi}
                disabled={aiLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-extrabold text-white bg-gradient-to-br from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 shadow-sm"
              >
                <Icon name="help" className="w-4 h-4" />
                {aiLoading ? "دارم فکر می‌کنم…" : "🤔 گیر کردم"}
              </button>
              <span className="text-xs text-violet-800/80">راهنمایی مرحله‌ای می‌گیری — جواب کامل لو نمی‌ره</span>
              {aiHistory.length > 0 && (
                <button
                  onClick={() => setShowAiHistory((v) => !v)}
                  className="mr-auto text-xs font-bold px-2.5 py-1 rounded-full border bg-white border-violet-200 text-violet-700 hover:bg-violet-50"
                >
                  سابقه {aiHistory.length}
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <input
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    askAi();
                  }
                }}
                placeholder="سوالت رو کوتاه بنویس (اختیاری) — مثلا: حلقه‌م درست نمی‌چرخه"
                className="flex-1 min-w-0 rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300 placeholder:text-slate-400"
              />
              <button
                onClick={askAi}
                disabled={aiLoading}
                className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-bold border bg-white border-violet-200 text-violet-700 hover:bg-violet-50 disabled:opacity-50"
              >
                <Icon name="send" className="w-4 h-4" /> بفرست
              </button>
            </div>

            {aiLoading && (
              <div className="rounded-lg bg-white border border-violet-100 p-3 text-xs text-muted flex items-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-violet-300 border-t-transparent rounded-full animate-spin" />
                مربی هوشمند داره کد و تست‌هات رو بررسی می‌کنه…
              </div>
            )}
            {aiError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800 whitespace-pre-wrap">
                {aiError}
              </div>
            )}
            {(aiHint || showAiPanel) && aiHint && !aiLoading && (
              <div className="rounded-xl bg-white border border-violet-200 p-3.5 shadow-sm">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-violet-700 mb-2">
                  <Icon name="sparkles" className="w-4 h-4" /> راهنمایی مربی
                  <button onClick={() => setShowAiPanel(false)} className="mr-auto text-muted hover:text-ink">
                    <Icon name="x" className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="text-sm leading-7 text-slate-800 whitespace-pre-wrap">{aiHint}</div>
                <p className="mt-2 text-[11px] text-muted">نکته: جواب کامل داده نمی‌شه — قدم‌به‌قدم جلو برو و دوباره «گیر کردم» بزن.</p>
              </div>
            )}
            {showAiHistory && aiHistory.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {aiHistory.map((h, i) => (
                  <div key={i} className="rounded-lg bg-white border border-slate-200 p-2.5 text-xs">
                    <div className="text-muted mb-1 flex items-center gap-2">
                      <Icon name="clock" className="w-3 h-3" />
                      {new Date(h.created_at).toLocaleString("fa-IR")} {h.user_message ? `— «${h.user_message}»` : ""}
                    </div>
                    <div className="text-slate-800 whitespace-pre-wrap leading-6">{h.ai_response}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <CodeMirror
            value={code}
            onChange={setCode}
            theme={dracula}
            height="220px"
            extensions={extensions}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                run();
              }
            }}
          />

          {running && <ListSkeleton rows={2} />}

          {summary && !running && (
            <div
              className={`rounded-xl p-4 flex items-center gap-4 ${
                summary.status === "correct"
                  ? "bg-emerald-50 border border-emerald-200"
                  : summary.status === "partial"
                  ? "bg-amber-50 border border-amber-200"
                  : "bg-red-50 border border-red-200"
              }`}
            >
              <div className="text-xl font-extrabold">
                {summary.passed}/{summary.total}
              </div>
              <div className="text-sm font-bold inline-flex items-center gap-1.5">
                {summary.status === "correct" ? (
                  <>
                    <Icon name="sparkles" className="w-4 h-4" /> همه پاس!
                  </>
                ) : summary.status === "partial" ? (
                  "نزدیک بودی"
                ) : (
                  "دوباره تلاش کن"
                )}
              </div>
            </div>
          )}

          {results && !running && (
            <div className="space-y-2">
              {results.map((r, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-3 text-xs ${
                    r.passed ? "border-emerald-200 bg-emerald-50/50" : "border-red-200 bg-red-50/50"
                  }`}
                >
                  <div className="flex justify-between font-bold mb-1.5">
                    <span>تست {i + 1}</span>
                    <span>{r.passed ? "✓ پاس" : "✗ ناموفق"}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 font-mono" dir="ltr">
                    <div>
                      <div className="text-muted mb-0.5">ورودی</div>
                      <div className="whitespace-pre-wrap break-words">{r.input || "(خالی)"}</div>
                    </div>
                    <div>
                      <div className="text-muted mb-0.5">انتظار</div>
                      <div className="whitespace-pre-wrap break-words">{r.expected || "(خالی)"}</div>
                    </div>
                    <div>
                      <div className="text-muted mb-0.5">خروجی تو</div>
                      <div className="whitespace-pre-wrap break-words">{r.actual || "(خالی)"}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-line flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold border border-line">
            بستن
          </button>
          <button
            onClick={run}
            disabled={running}
            className="px-5 py-2 rounded-lg text-sm font-bold text-white bg-gradient-to-br from-primary to-primary2 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            {running ? (
              "در حال اجرا…"
            ) : (
              <>
                <Icon name="play" className="w-4 h-4" /> اجرا (Ctrl+Enter)
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
