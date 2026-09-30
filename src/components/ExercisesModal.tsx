"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ToastProvider";
import { fmtRelative } from "@/lib/utils";
import ExerciseSolveModal from "@/components/ExerciseSolveModal";
import ExerciseFormModal from "@/components/ExerciseFormModal";
import SubmissionsModal from "@/components/SubmissionsModal";
import LibraryPickerModal from "@/components/LibraryPickerModal";
import type { Exercise, ExerciseSubmission, SharedExercise } from "@/lib/types";
import { CardGridSkeleton } from "@/components/Skeleton";
import Icon from "@/components/Icon";

export default function ExercisesModal({
  classId,
  teacherMode,
  onClose,
}: {
  classId: string;
  teacherMode: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [mySubs, setMySubs] = useState<Record<string, ExerciseSubmission>>({});
  const [loading, setLoading] = useState(true);

  const [solving, setSolving] = useState<Exercise | null>(null);
  const [editing, setEditing] = useState<Exercise | null | "new">(null);
  const [templateForNew, setTemplateForNew] = useState<SharedExercise | null>(null);
  const [viewingSubs, setViewingSubs] = useState<Exercise | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("exercises")
      .select("*")
      .eq("class_id", classId)
      .order("created_at", { ascending: true });
    const list = data || [];
    setExercises(list);
    if (list.length && user) {
      const { data: subs } = await supabase
        .from("exercise_submissions")
        .select("*")
        .in(
          "exercise_id",
          list.map((e) => e.id)
        )
        .eq("user_id", user.id);
      const map: Record<string, ExerciseSubmission> = {};
      (subs || []).forEach((s) => (map[s.exercise_id] = s));
      setMySubs(map);
    } else {
      setMySubs({});
    }
    setLoading(false);
  }, [classId, user]);

  useEffect(() => {
    load();
  }, [load]);

  const deleteExercise = async (ex: Exercise) => {
    if (!confirm(`تمرین «${ex.title}» حذف شود؟`)) return;
    const { error } = await supabase.from("exercises").delete().eq("id", ex.id);
    if (error) return toast("خطا: " + error.message, "err");
    toast("حذف شد", "ok");
    load();
  };

  return (
    <div
      className="fixed inset-0 z-[105] bg-slate-900/50 backdrop-blur-sm anim-fade flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl anim-pop w-full max-w-3xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h2 className="font-extrabold inline-flex items-center gap-2">
            <Icon name="file" className="w-5 h-5" /> تمرین‌ها
          </h2>
          <button onClick={onClose} className="text-muted hover:text-ink inline-flex items-center" aria-label="بستن">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1">
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <span className="text-sm text-muted">{exercises.length} تمرین</span>
            {teacherMode && (
              <div className="flex gap-2">
                <button
                  onClick={() => setLibraryOpen(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border border-line inline-flex items-center gap-1.5"
                >
                  <Icon name="book" className="w-4 h-4" /> از کتابخانه
                </button>
                <button
                  onClick={() => {
                    setTemplateForNew(null);
                    setEditing("new");
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-br from-primary to-primary2"
                >
                  + تمرین جدید
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <CardGridSkeleton count={4} />
          ) : exercises.length === 0 ? (
            <div className="text-center py-16">
              <div className="mb-2 flex justify-center text-primary">
                <Icon name="file" className="w-8 h-8" />
              </div>
              <h3 className="font-bold">{teacherMode ? "هنوز تمرینی نساختی" : "هنوز تمرینی نیست"}</h3>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {exercises.map((ex) => {
                const sub = mySubs[ex.id];
                const status = sub?.status || "pending";
                const total = ex.test_cases?.length || 1;
                const solved = status === "correct";
                const partial = status === "partial";
                return (
                  <div
                    key={ex.id}
                    className={`border rounded-xl p-4 ${
                      solved ? "border-emerald-300 bg-emerald-50/40" : partial ? "border-amber-300 bg-amber-50/30" : "border-line"
                    }`}
                  >
                    <div className="font-bold text-sm mb-1 flex items-center gap-1.5">
                      <Icon name="file" className="w-4 h-4 shrink-0" /> {ex.title}
                    </div>
                    {ex.description && <p className="text-xs text-muted mb-2 line-clamp-2">{ex.description}</p>}
                    {teacherMode && ex.shared_exercise_id && (
                      <div className="text-[11px] text-emerald-600 font-bold mb-1">✓ در کتابخانه اشتراکی</div>
                    )}
                    <div className="flex items-center gap-2 text-[11px] text-muted mb-3">
                      {!teacherMode && (
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold ${
                            solved
                              ? "bg-emerald-100 text-emerald-700"
                              : partial
                              ? "bg-amber-100 text-amber-700"
                              : status === "wrong" || status === "error"
                              ? "bg-red-100 text-red-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {solved
                            ? "✓ حل شد"
                            : partial
                            ? `◐ ${sub?.passed_tests || 0}/${total}`
                            : status === "wrong"
                            ? "✗ نادرست"
                            : status === "error"
                            ? "⚠ خطا"
                            : "○ حل نشده"}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full bg-slate-100">{total} تست</span>
                      {teacherMode && <span>{fmtRelative(ex.created_at)}</span>}
                    </div>

                    {teacherMode ? (
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => setViewingSubs(ex)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-line inline-flex items-center gap-1.5"
                        >
                          <Icon name="eye" className="w-4 h-4" /> پاسخ‌ها
                        </button>
                        <button
                          onClick={() => {
                            setTemplateForNew(null);
                            setEditing(ex);
                          }}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-line inline-flex items-center gap-1.5"
                        >
                          <Icon name="edit" className="w-4 h-4" /> ویرایش
                        </button>
                        <button
                          onClick={() => deleteExercise(ex)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-danger border border-red-200 inline-flex items-center gap-1.5"
                        >
                          <Icon name="trash" className="w-4 h-4" /> حذف
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setSolving(ex)}
                        className="w-full px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-br from-primary to-primary2 inline-flex items-center justify-center gap-1.5"
                      >
                        {solved ? (
                          <>
                            <Icon name="refresh" className="w-4 h-4" /> دوباره حل کن
                          </>
                        ) : (
                          <>
                            <Icon name="play" className="w-4 h-4" /> حل کن
                          </>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {solving && (
        <ExerciseSolveModal
          exercise={solving}
          mySubmission={mySubs[solving.id]}
          onClose={() => setSolving(null)}
          onSubmitted={(sub) => {
            setMySubs((prev) => ({ ...prev, [sub.exercise_id]: sub }));
          }}
        />
      )}

      {editing && (
        <ExerciseFormModal
          classId={classId}
          exercise={editing === "new" ? null : editing}
          template={
            templateForNew
              ? {
                  title: templateForNew.title,
                  description: templateForNew.description || "",
                  hint: templateForNew.hint || "",
                  test_cases: templateForNew.test_cases || [],
                }
              : null
          }
          onClose={() => {
            setEditing(null);
            setTemplateForNew(null);
          }}
          onSaved={() => {
            setEditing(null);
            setTemplateForNew(null);
            load();
          }}
        />
      )}

      {viewingSubs && <SubmissionsModal exercise={viewingSubs} onClose={() => setViewingSubs(null)} />}

      {libraryOpen && (
        <LibraryPickerModal
          onClose={() => setLibraryOpen(false)}
          onPick={(ex) => {
            setTemplateForNew(ex);
            setLibraryOpen(false);
            setEditing("new");
          }}
        />
      )}
    </div>
  );
}
