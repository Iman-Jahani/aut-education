"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ToastProvider";
import { fmtRelative } from "@/lib/utils";
import type { Quiz, QuizAnswer } from "@/lib/types";
import Icon from "@/components/Icon";

function fmtClock(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function QuizTakeView({
  quiz,
  myAnswer,
  onSubmitted,
}: {
  quiz: Quiz;
  myAnswer?: QuizAnswer;
  onSubmitted: (a: QuizAnswer) => void;
}) {
  const { user, displayName } = useAuth();
  const toast = useToast();
  const qs = quiz.questions || [];
  const [selected, setSelected] = useState<number[]>(() => Array(qs.length).fill(-1));
  const [remaining, setRemaining] = useState(() => {
    const elapsed = Math.floor((Date.now() - new Date(quiz.started_at || Date.now()).getTime()) / 1000);
    return Math.max(0, quiz.time_limit * 60 - elapsed);
  });
  const [submitting, setSubmitting] = useState(false);

  const answeredCount = useMemo(() => selected.filter((s) => s >= 0).length, [selected]);

  const submit = async () => {
    if (!user || submitting) return;
    setSubmitting(true);
    let score = 0;
    selected.forEach((a, i) => {
      if (a === qs[i]?.correct) score++;
    });
    const payload: QuizAnswer = {
      quiz_id: quiz.id,
      user_id: user.id,
      author_name: displayName,
      answers: selected,
      score,
      total_questions: qs.length,
      submitted_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("quiz_answers").upsert(payload, { onConflict: "quiz_id,user_id" });
    setSubmitting(false);
    if (error) return toast("خطا: " + error.message, "err");
    toast(`ثبت شد! نمره: ${score}/${qs.length}`, "ok");
    onSubmitted(payload);
  };

  useEffect(() => {
    if (myAnswer) return;
    if (remaining <= 0) return;
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(t);
          submit();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myAnswer]);

  if (myAnswer) {
    const pct = myAnswer.score / myAnswer.total_questions;
    return (
      <div className="space-y-4">
        <div
          className={`rounded-xl p-4 flex items-center gap-4 ${
            pct === 1 ? "bg-emerald-50 border border-emerald-200" : pct >= 0.5 ? "bg-amber-50 border border-amber-200" : "bg-red-50 border border-red-200"
          }`}
        >
          <div className="text-xl font-extrabold">
            {myAnswer.score}/{myAnswer.total_questions}
          </div>
          <div className="text-sm">
            <div className="font-bold inline-flex items-center gap-1.5">
              {pct === 1 ? (
                <>
                  <Icon name="sparkles" className="w-4 h-4 text-emerald-600" />
                  همه درست!
                </>
              ) : pct >= 0.5 ? (
                <>
                  <Icon name="star" className="w-4 h-4 text-amber-500" />
                  خوب بود
                </>
              ) : (
                <>
                  <Icon name="target" className="w-4 h-4 text-red-500" />
                  نیاز به تلاش
                </>
              )}
            </div>
            <div className="text-xs text-muted">ارسال شده {fmtRelative(myAnswer.submitted_at)}</div>
          </div>
        </div>
        <h3 className="text-sm font-bold text-muted inline-flex items-center gap-1.5">
          <Icon name="list" className="w-4 h-4" /> مرور پاسخ‌ها
        </h3>
        {qs.map((q, i) => {
          const chosen = myAnswer.answers[i];
          return (
            <div key={i} className="border border-line rounded-lg p-3">
              <div className="font-bold text-sm mb-2">
                {i + 1}. {q.question}
              </div>
              <div className="space-y-1">
                {q.options.map((opt, j) => {
                  const isCorrect = j === q.correct;
                  const isChosenWrong = j === chosen && chosen !== q.correct;
                  return (
                    <div
                      key={j}
                      className={`text-sm px-2.5 py-1.5 rounded-lg ${
                        isCorrect ? "bg-emerald-50 text-emerald-800" : isChosenWrong ? "bg-red-50 text-red-800" : "text-ink/80"
                      }`}
                    >
                      {String.fromCharCode(65 + j)}. {opt} {isCorrect ? "✓" : isChosenWrong ? "✗" : ""}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (remaining <= 0) {
    return (
      <div className="text-center py-16 text-muted flex items-center justify-center gap-2">
        <Icon name="clock" className="w-5 h-5" /> زمان کوییز تموم شده
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-slate-50 rounded-lg py-2.5">
          <div className="text-lg font-extrabold">{qs.length}</div>
          <div className="text-[11px] text-muted">سوال</div>
        </div>
        <div className="bg-slate-50 rounded-lg py-2.5">
          <div className="text-lg font-extrabold">{fmtClock(remaining)}</div>
          <div className="text-[11px] text-muted">زمان باقی</div>
        </div>
        <div className="bg-slate-50 rounded-lg py-2.5">
          <div className="text-lg font-extrabold">{answeredCount}</div>
          <div className="text-[11px] text-muted">پاسخ داده</div>
        </div>
      </div>

      {qs.map((q, i) => (
        <div key={i} className="border border-line rounded-lg p-3">
          <div className="text-[11px] text-muted mb-1">
            سوال {i + 1} از {qs.length}
          </div>
          <div className="font-bold text-sm mb-2.5">{q.question}</div>
          <div className="space-y-1.5">
            {q.options.map((opt, j) => (
              <label
                key={j}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer text-sm ${
                  selected[i] === j ? "border-primary bg-indigo-50" : "border-line"
                }`}
              >
                <input
                  type="radio"
                  name={`q-${i}`}
                  checked={selected[i] === j}
                  onChange={() => setSelected((prev) => prev.map((v, idx) => (idx === i ? j : v)))}
                  className="accent-primary"
                />
                <span className="font-bold text-primary w-5 text-center">{String.fromCharCode(65 + j)}</span>
                <span>{opt}</span>
              </label>
            ))}
          </div>
        </div>
      ))}

      <button
        onClick={submit}
        disabled={submitting}
        className="w-full py-3 rounded-lg text-sm font-bold text-white bg-gradient-to-br from-primary to-primary2 disabled:opacity-50 inline-flex items-center justify-center gap-2"
      >
        <Icon name="send" className="w-4 h-4" /> ارسال پاسخ‌ها
      </button>
    </div>
  );
}
