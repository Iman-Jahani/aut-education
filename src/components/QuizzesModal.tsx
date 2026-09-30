"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ToastProvider";
import QuizFormModal from "@/components/QuizFormModal";
import QuizTakeView from "@/components/QuizTakeView";
import QuizResultsView from "@/components/QuizResultsView";
import type { Quiz, QuizAnswer } from "@/lib/types";
import { CardGridSkeleton } from "@/components/Skeleton";
import Icon from "@/components/Icon";

const STATUS_LABEL: Record<string, string> = { active: "● فعال", ended: "پایان یافته", draft: "پیش‌نویس" };
const STATUS_CLASS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  ended: "bg-slate-100 text-slate-600",
  draft: "bg-amber-100 text-amber-700",
};

export default function QuizzesModal({
  classId,
  teacherMode,
  initialTakeActive = false,
  onClose,
}: {
  classId: string;
  teacherMode: boolean;
  initialTakeActive?: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [myAnswers, setMyAnswers] = useState<Record<string, QuizAnswer>>({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "take" | "results">(initialTakeActive ? "take" : "list");
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
  const [formOpen, setFormOpen] = useState<Quiz | "new" | null>(null);

  const activeQuiz = quizzes.find((q) => q.status === "active") || null;

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("quizzes")
      .select("*")
      .eq("class_id", classId)
      .order("created_at", { ascending: false });
    const list = data || [];
    setQuizzes(list);
    if (list.length && user) {
      const { data: ans } = await supabase
        .from("quiz_answers")
        .select("*")
        .in(
          "quiz_id",
          list.map((q) => q.id)
        )
        .eq("user_id", user.id);
      const map: Record<string, QuizAnswer> = {};
      (ans || []).forEach((a) => (map[a.quiz_id] = a));
      setMyAnswers(map);
    }
    setLoading(false);
  }, [classId, user]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (initialTakeActive && activeQuiz) {
      setSelectedQuiz(activeQuiz);
      setView("take");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTakeActive, quizzes.length]);

  const startQuiz = async (q: Quiz) => {
    if (!confirm("کوییز شروع بشه؟ همه‌ی دانشجوها می‌بیننش.")) return;
    const others = quizzes.filter((x) => x.status === "active" && x.id !== q.id);
    for (const o of others) await supabase.from("quizzes").update({ status: "ended" }).eq("id", o.id);
    const { error } = await supabase.from("quizzes").update({ status: "active", started_at: new Date().toISOString() }).eq("id", q.id);
    if (error) return toast("خطا: " + error.message, "err");
    toast("کوییز شروع شد!", "ok");
    await load();
    setSelectedQuiz({ ...q, status: "active", started_at: new Date().toISOString() });
    setView("results");
  };

  const stopQuiz = async (q: Quiz) => {
    if (!confirm("کوییز تموم بشه؟")) return;
    const { error } = await supabase.from("quizzes").update({ status: "ended" }).eq("id", q.id);
    if (error) return toast("خطا: " + error.message, "err");
    toast("کوییز تموم شد", "ok");
    await load();
    setView("list");
  };

  const deleteQuiz = async (q: Quiz) => {
    if (!confirm(`کوییز «${q.title}» حذف شود؟`)) return;
    const { error } = await supabase.from("quizzes").delete().eq("id", q.id);
    if (error) return toast("خطا: " + error.message, "err");
    toast("حذف شد", "ok");
    load();
  };

  let title = "کوییزها";
  let titleIcon: "help" | "eye" = "help";
  if (view === "take" && selectedQuiz) title = selectedQuiz.title;
  if (view === "results" && selectedQuiz) {
    title = "نتایج: " + selectedQuiz.title;
    titleIcon = "eye";
  }

  return (
    <div
      className="fixed inset-0 z-[105] bg-slate-900/50 backdrop-blur-sm anim-fade flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl anim-pop w-full max-w-2xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h2 className="font-extrabold inline-flex items-center gap-2">
            <Icon name={titleIcon} className="w-5 h-5" />
            {title}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="بستن">
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1">
          {loading ? (
            <CardGridSkeleton count={4} />
          ) : view === "take" && selectedQuiz ? (
            <QuizTakeView
              quiz={selectedQuiz}
              myAnswer={myAnswers[selectedQuiz.id]}
              onSubmitted={(a) => setMyAnswers((prev) => ({ ...prev, [a.quiz_id]: a }))}
            />
          ) : view === "results" && selectedQuiz ? (
            <>
              <button onClick={() => setView("list")} className="text-xs font-bold text-primary mb-3">
                ← برگشت
              </button>
              <QuizResultsView quiz={selectedQuiz} onStop={() => stopQuiz(selectedQuiz)} />
            </>
          ) : teacherMode ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-muted">{quizzes.length} کوییز</span>
                <button
                  onClick={() => setFormOpen("new")}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-br from-primary to-primary2"
                >
                  + کوییز جدید
                </button>
              </div>
              {quizzes.length === 0 ? (
                <div className="text-center py-16">
                  <div className="mb-2 flex justify-center text-primary">
                    <Icon name="help" className="w-8 h-8" />
                  </div>
                  <h3 className="font-bold">هنوز کوییز نساختی</h3>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {quizzes.map((q) => (
                    <div key={q.id} className="border border-line rounded-xl p-4">
                      <div className="font-bold text-sm mb-1.5 inline-flex items-center gap-1.5">
                        <Icon name="help" className="w-4 h-4" /> {q.title}
                      </div>
                      <div className="flex gap-2 text-[11px] text-muted mb-2">
                        <span className="px-2 py-0.5 bg-slate-100 rounded-full">{q.questions.length} سوال</span>
                        <span className="px-2 py-0.5 bg-slate-100 rounded-full">{q.time_limit} دقیقه</span>
                      </div>
                      <div className="flex justify-end mb-2.5">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS_CLASS[q.status]}`}>
                          {STATUS_LABEL[q.status]}
                        </span>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {q.status === "draft" && (
                          <>
                            <button onClick={() => startQuiz(q)} className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 inline-flex items-center gap-1.5">
                              <Icon name="play" className="w-4 h-4" /> شروع
                            </button>
                            <button onClick={() => setFormOpen(q)} className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-line inline-flex items-center gap-1.5">
                              <Icon name="edit" className="w-4 h-4" /> ویرایش
                            </button>
                            <button
                              onClick={() => deleteQuiz(q)}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-danger border border-red-200 inline-flex items-center"
                              aria-label="حذف"
                            >
                              <Icon name="trash" className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {q.status === "active" && (
                          <>
                            <button onClick={() => stopQuiz(q)} className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-white bg-warning inline-flex items-center gap-1.5">
                              <Icon name="flag" className="w-4 h-4" /> پایان
                            </button>
                            <button
                              onClick={() => {
                                setSelectedQuiz(q);
                                setView("results");
                              }}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-line inline-flex items-center gap-1.5"
                            >
                              <Icon name="eye" className="w-4 h-4" /> نتایج زنده
                            </button>
                          </>
                        )}
                        {q.status === "ended" && (
                          <>
                            <button
                              onClick={() => {
                                setSelectedQuiz(q);
                                setView("results");
                              }}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-line inline-flex items-center gap-1.5"
                            >
                              <Icon name="eye" className="w-4 h-4" /> مشاهده نتایج
                            </button>
                            <button
                              onClick={() => deleteQuiz(q)}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-danger border border-red-200 inline-flex items-center"
                              aria-label="حذف"
                            >
                              <Icon name="trash" className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {quizzes.filter((q) => q.status === "ended").length === 0 ? (
                <div className="text-center py-16">
                  <div className="mb-2 flex justify-center text-primary">
                    <Icon name="help" className="w-8 h-8" />
                  </div>
                  <h3 className="font-bold">هنوز کوییز فعالی نیست</h3>
                  <p className="text-sm text-muted mt-1">وقتی استاد کوییز شروع کنه اینجا می‌بینی.</p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {quizzes
                    .filter((q) => q.status === "ended")
                    .map((q) => {
                      const myAns = myAnswers[q.id];
                      return (
                        <div key={q.id} className="border border-line rounded-xl p-4">
                          <div className="font-bold text-sm mb-1.5 inline-flex items-center gap-1.5">
                            <Icon name="help" className="w-4 h-4" /> {q.title}
                          </div>
                          <div className="flex gap-2 text-[11px] text-muted mb-3">
                            <span className="px-2 py-0.5 bg-slate-100 rounded-full">{q.questions.length} سوال</span>
                            <span className="px-2 py-0.5 bg-slate-100 rounded-full">{q.time_limit} دقیقه</span>
                          </div>
                          {myAns ? (
                            <div className="flex items-center justify-between">
                              <div className="text-xs text-muted">
                                نمره شما: <b className="text-ink">{myAns.score}/{myAns.total_questions}</b>
                              </div>
                              <button
                                onClick={() => {
                                  setSelectedQuiz(q);
                                  setView("results");
                                }}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-line inline-flex items-center gap-1.5"
                              >
                                <Icon name="eye" className="w-4 h-4" /> مرور
                              </button>
                            </div>
                          ) : (
                            <div className="text-xs text-muted">شرکت نکردی</div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {formOpen && (
        <QuizFormModal
          classId={classId}
          quiz={formOpen === "new" ? null : formOpen}
          onClose={() => setFormOpen(null)}
          onSaved={() => {
            setFormOpen(null);
            load();
          }}
        />
      )}
    </div>
  );
}
