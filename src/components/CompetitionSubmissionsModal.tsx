"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmtRelative } from "@/lib/utils";
import type { Competition, CompetitionSubmission } from "@/lib/types";
import { ListSkeleton } from "@/components/Skeleton";
import Icon from "@/components/Icon";

export default function CompetitionSubmissionsModal({
  competition,
  onClose,
}: {
  competition: Competition;
  onClose: () => void;
}) {
  const [subs, setSubs] = useState<CompetitionSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("competition_submissions")
        .select("*")
        .eq("competition_id", competition.id)
        .order("submitted_at", { ascending: false });
      if (!cancelled) {
        setSubs(data || []);
        setLoading(false);
      }
    };
    load();
    const interval = competition.status === "active" ? setInterval(load, 4000) : null;
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [competition.id, competition.status]);

  return (
    <div
      className="fixed inset-0 z-[115] bg-slate-900/50 backdrop-blur-sm anim-fade flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl anim-pop w-full max-w-xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h2 className="font-extrabold flex items-center gap-2">
            <Icon name="eye" className="w-5 h-5 text-primary" />
            پاسخ‌های تیم‌ها: {competition.title}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {loading ? (
            <ListSkeleton rows={3} />
          ) : subs.length === 0 ? (
            <div className="text-center text-sm text-muted py-10">هنوز پاسخی از هیچ تیمی نیست</div>
          ) : (
            <div className="space-y-2">
              {subs.map((s) => (
                <div key={s.team_id}>
                  <button
                    onClick={() => setExpanded((e) => (e === s.team_id ? null : s.team_id))}
                    className="w-full flex items-center gap-3 border border-line rounded-lg px-3 py-2.5 text-right hover:border-primary/40"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate flex items-center gap-1.5">
                        <Icon name="flag" className="w-4 h-4 shrink-0 text-primary" />
                        <span className="truncate">{s.team_name}</span>
                      </div>
                      <div className="text-xs text-muted">
                        {s.author_name} · {fmtRelative(s.submitted_at)}
                      </div>
                    </div>
                    <span className="text-xs font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">✓ ارسال شد</span>
                  </button>
                  {expanded === s.team_id && (
                    <pre
                      className="mt-1.5 mb-2 bg-[#0b1020] text-emerald-200 rounded-lg p-3 text-xs font-mono overflow-x-auto max-h-72 whitespace-pre-wrap"
                      dir="ltr"
                    >
                      {s.code || "(خالی)"}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
