"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import type { Quiz, QuizAnswer } from "@/lib/types";
import { StatsListSkeleton } from "@/components/Skeleton";
import Icon from "@/components/Icon";

export default function QuizResultsView({ quiz, onStop }: { quiz: Quiz; onStop: () => void }) {
  const { user } = useAuth();
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [classMemberCount, setClassMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [ansRes, teamsRes, cellsRes] = await Promise.all([
        supabase.from("quiz_answers").select("*").eq("quiz_id", quiz.id).order("score", { ascending: false }).order("submitted_at", { ascending: true }),
        supabase.from("teams").select("id").eq("class_id", quiz.class_id),
        supabase.from("cells").select("author_name").eq("class_id", quiz.class_id),
      ]);
      if (cancelled) return;
      setAnswers(ansRes.data || []);
      const teamIds = new Set((teamsRes.data || []).map((t) => t.id));
      let members = new Set<string>();
      if (teamIds.size) {
        const { data: allMembers } = await supabase.from("team_members").select("team_id, display_name");
        (allMembers || []).forEach((m) => {
          if (teamIds.has(m.team_id) && m.display_name) members.add(m.display_name);
        });
      }
      (cellsRes.data || []).forEach((c) => {
        if (c.author_name) members.add(c.author_name);
      });
      setClassMemberCount(members.size);
      setLoading(false);
    };
    load();
    const interval = quiz.status === "active" ? setInterval(load, 3000) : null;
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [quiz.id, quiz.class_id, quiz.status]);

  const avg = answers.length ? Math.round((answers.reduce((s, a) => s + (a.score || 0), 0) / answers.length) * 10) / 10 : 0;
  const notSubmitted = Math.max(0, classMemberCount - answers.length);

  if (loading) return <StatsListSkeleton stats={3} rows={4} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-slate-50 rounded-lg py-2.5">
          <div className="text-lg font-extrabold">{answers.length}</div>
          <div className="text-[11px] text-muted">شرکت کردن</div>
        </div>
        <div className="bg-slate-50 rounded-lg py-2.5">
          <div className="text-lg font-extrabold">{avg}</div>
          <div className="text-[11px] text-muted">میانگین</div>
        </div>
        <div className="bg-slate-50 rounded-lg py-2.5">
          <div className="text-lg font-extrabold">{notSubmitted}</div>
          <div className="text-[11px] text-muted">شرکت نکردن</div>
        </div>
      </div>

      <h3 className="text-sm font-bold text-muted inline-flex items-center gap-1.5">
        <Icon name="trophy" className="w-4 h-4" /> رتبه‌بندی
      </h3>
      {answers.length === 0 ? (
        <div className="text-center text-sm text-muted py-8">هنوز کسی شرکت نکرده</div>
      ) : (
        <div className="space-y-1.5">
          {answers.map((a, i) => {
            const medal =
              i === 0 ? (
                <Icon name="award" className="w-5 h-5 text-amber-500" />
              ) : i === 1 ? (
                <Icon name="award" className="w-5 h-5 text-slate-400" />
              ) : i === 2 ? (
                <Icon name="award" className="w-5 h-5 text-orange-500" />
              ) : (
                `#${i + 1}`
              );
            const isMe = a.user_id === user?.id;
            return (
              <div
                key={a.user_id}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg ${isMe ? "bg-indigo-50 border border-primary/30" : "bg-slate-50"}`}
              >
                <div className="w-8 flex items-center justify-center font-bold">{medal}</div>
                <div className="flex-1 text-sm font-bold truncate">
                  {a.author_name} {isMe && <span className="text-primary text-xs">(شما)</span>}
                </div>
                <div className="font-bold text-sm">
                  {a.score}/{a.total_questions}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <h3 className="text-sm font-bold text-muted pt-2 inline-flex items-center gap-1.5">
        <Icon name="list" className="w-4 h-4" /> سوالات و پاسخ‌های درست
      </h3>
      {quiz.questions.map((q, i) => (
        <div key={i} className="border border-line rounded-lg p-3">
          <div className="font-bold text-sm mb-2">
            {i + 1}. {q.question}
          </div>
          <div className="space-y-1">
            {q.options.map((opt, j) => (
              <div
                key={j}
                className={`text-sm px-2.5 py-1.5 rounded-lg ${j === q.correct ? "bg-emerald-50 text-emerald-800" : "text-ink/80"}`}
              >
                {String.fromCharCode(65 + j)}. {opt} {j === q.correct ? "✓" : ""}
              </div>
            ))}
          </div>
        </div>
      ))}

      {quiz.status === "active" && (
        <button onClick={onStop} className="w-full py-2.5 rounded-lg text-sm font-bold text-white bg-warning inline-flex items-center justify-center gap-2">
          <Icon name="flag" className="w-4 h-4" /> پایان کوییز
        </button>
      )}
    </div>
  );
}
