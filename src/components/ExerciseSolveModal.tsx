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
