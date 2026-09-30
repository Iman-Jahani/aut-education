"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmtRelative } from "@/lib/utils";
import type { Exercise, ExerciseSubmission } from "@/lib/types";
import { StatsListSkeleton } from "@/components/Skeleton";
import Icon from "@/components/Icon";

const STATUS_LABEL: Record<string, string> = {
  correct: "✓ کامل",
  partial: "◐ ناقص",
  wrong: "✗ نادرست",
  error: "⚠ خطا",
  pending: "○ نامشخص",
};

export default function SubmissionsModal({
  exercise,
  onClose,
}: {
  exercise: Exercise;
  onClose: () => void;
}) {
  const [subs, setSubs] = useState<ExerciseSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("exercise_submissions")
        .select("*")
        .eq("exercise_id", exercise.id)
        .order("submitted_at", { ascending: false });
      setSubs(data || []);
      setLoading(false);
    })();
  }, [exercise.id]);

  const totalTests = exercise.test_cases?.length || 1;
  const correct = subs.filter((s) => s.status === "correct").length;
  const partial = subs.filter((s) => s.status === "partial").length;
  const wrong = subs.filter((s) => s.status === "wrong" || s.status === "error").length;

  return (
    <div
      className="fixed inset-0 z-[110] bg-slate-900/50 backdrop-blur-sm anim-fade flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl anim-pop w-full max-w-xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h2 className="font-extrabold inline-flex items-center gap-2">
            <Icon name="eye" className="w-5 h-5" /> {exercise.title}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-ink inline-flex items-center" aria-label="بستن">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1">
          {loading ? (
            <StatsListSkeleton stats={4} rows={3} />
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2 mb-5">
                <StatBox label="پاسخ" value={subs.length} />
                <StatBox label="کامل" value={correct} color="text-emerald-600" />
                <StatBox label="ناقص" value={partial} color="text-amber-600" />
                <StatBox label="ناموفق" value={wrong} color="text-red-600" />
              </div>

              {subs.length === 0 ? (
                <div className="text-center text-sm text-muted py-10">هنوز پاسخی نیست</div>
              ) : (
                <div className="space-y-2">
                  {subs.map((s) => (
                    <div key={s.exercise_id + s.user_id}>
                      <button
                        onClick={() => setExpanded((e) => (e === s.user_id ? null : s.user_id))}
                        className="w-full flex items-center gap-3 border border-line rounded-lg px-3 py-2.5 text-right hover:border-primary/40"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm truncate">{s.author_name}</div>
                          <div className="text-xs text-muted">
                            {fmtRelative(s.submitted_at)} · {s.passed_tests || 0}/{s.total_tests || totalTests}
                          </div>
                        </div>
                        <span className="text-xs font-bold px-2 py-1 rounded-full bg-slate-100">
                          {STATUS_LABEL[s.status] || s.status}
                        </span>
                      </button>
                      {expanded === s.user_id && (
                        <div className="mt-1.5 mb-2 border border-line rounded-lg p-3 bg-slate-50">
                          <div className="text-[11px] font-bold text-muted mb-1.5 flex items-center gap-1.5">
                            <Icon name="code" className="w-4 h-4" /> کد
                          </div>
                          <pre
                            className="bg-[#0b1020] text-emerald-200 rounded-lg p-3 text-xs font-mono overflow-x-auto max-h-56 whitespace-pre-wrap"
                            dir="ltr"
                          >
                            {s.code || "(خالی)"}
                          </pre>
                          {Array.isArray(s.test_results) && s.test_results.length > 0 && (
                            <div className="mt-2 space-y-1.5">
                              {s.test_results.map((r, i) => (
                                <div
                                  key={i}
                                  className={`text-xs rounded p-2 ${r.passed ? "bg-emerald-50" : "bg-red-50"}`}
                                >
                                  تست {i + 1}: {r.passed ? "✓" : "✗"}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="text-center bg-slate-50 rounded-lg py-2.5">
      <div className={`text-lg font-extrabold ${color || ""}`}>{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}
