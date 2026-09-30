"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { dracula } from "@uiw/codemirror-theme-dracula";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ToastProvider";
import { fmtRelative } from "@/lib/utils";
import { noPaste } from "@/lib/editor";
import type { Competition, CompetitionSubmission } from "@/lib/types";
import type { CurrentTeam } from "@/components/TeamPicker";
import Icon from "@/components/Icon";

function fmtClock(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function CompetitionTakeView({
  competition,
  currentTeam,
  teamSubmission,
  onSubmitted,
  onNeedTeam,
}: {
  competition: Competition;
  currentTeam: CurrentTeam | null;
  teamSubmission?: CompetitionSubmission;
  onSubmitted: (s: CompetitionSubmission) => void;
  onNeedTeam: () => void;
}) {
  const { user, displayName } = useAuth();
  const toast = useToast();
  const draftKey = currentTeam ? `comp_draft_${competition.id}_team_${currentTeam.id}` : "";
  const [code, setCode] = useState(() => (draftKey && typeof window !== "undefined" ? localStorage.getItem(draftKey) || "" : ""));
  const [remaining, setRemaining] = useState(() => {
    const elapsed = Math.floor((Date.now() - new Date(competition.started_at || Date.now()).getTime()) / 1000);
    return Math.max(0, competition.time_limit * 60 - elapsed);
  });
  const [submitting, setSubmitting] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const extensions = useMemo(() => [python(), noPaste(() => toast("پیست کردن غیرفعاله", "err"))], [toast]);

  const submit = async (auto = false) => {
    if (!currentTeam || !user) return;
    if (!code.trim()) {
      if (!auto) toast("کدی ننوشتی", "err");
      return;
    }
    if (!auto && !confirm(`پاسخ تیم «${currentTeam.name}» ارسال بشه؟ بعد از ارسال، بقیه‌ی اعضای تیم هم می‌بیننش و دیگه نمی‌شه تغییرش داد.`)) return;
    setSubmitting(true);
    const payload: CompetitionSubmission = {
      competition_id: competition.id,
      team_id: currentTeam.id,
      team_name: currentTeam.name,
      user_id: user.id,
      author_name: displayName,
      code,
      submitted_at: new Date().toISOString(),
      submitter_key: "team:" + currentTeam.id,
    };
    const { error } = await supabase.from("competition_submissions").upsert(payload, { onConflict: "competition_id,submitter_key" });
    setSubmitting(false);
    if (error) return toast("خطا: " + error.message, "err");
    try {
      if (draftKey) localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
    toast(auto ? "زمان تموم شد و پاسخ تیم خودکار ارسال شد" : "پاسخ تیم ارسال شد", "ok");
    onSubmitted(payload);
  };

  useEffect(() => {
    if (!draftKey) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, code);
      } catch {
        /* ignore */
      }
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [code, draftKey]);

  useEffect(() => {
    if (teamSubmission) return;
    if (!currentTeam) return;
    if (remaining <= 0) return;
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(t);
          submit(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamSubmission, currentTeam]);

  if (!currentTeam) {
    return (
      <div>
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-sm text-indigo-900 mb-4 whitespace-pre-wrap">
          <div className="font-bold text-xs mb-1 inline-flex items-center gap-1.5">
            <Icon name="list" className="w-4 h-4" />
            صورت سوال
          </div>
          {competition.description}
        </div>
        <div className="text-center py-10">
          <div className="mb-2 flex justify-center text-primary">
            <Icon name="users" className="w-8 h-8" />
          </div>
          <h3 className="font-bold mb-1">این مسابقه تیمیه!</h3>
          <p className="text-sm text-muted mb-4">برای شرکت توی مسابقه، اول باید به یه تیم بپیوندی یا تیم جدید بسازی.</p>
          <button onClick={onNeedTeam} className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-gradient-to-br from-primary to-primary2">
            انتخاب تیم
          </button>
        </div>
      </div>
    );
  }

  if (teamSubmission) {
    const submittedByMe = teamSubmission.user_id === user?.id;
    return (
      <div>
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <span className="text-white text-xs font-bold px-3 py-1 rounded-full inline-flex items-center gap-1.5" style={{ background: currentTeam.color }}>
            <Icon name="flag" className="w-4 h-4" />
            تیم: {currentTeam.name}
          </span>
          <span className="text-xs text-muted">
            ثبت‌شده توسط {teamSubmission.author_name}
            {submittedByMe ? " (شما)" : ""} · {fmtRelative(teamSubmission.submitted_at)}
          </span>
        </div>
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-sm text-indigo-900 mb-4 whitespace-pre-wrap">
          <div className="font-bold text-xs mb-1 inline-flex items-center gap-1.5">
            <Icon name="list" className="w-4 h-4" />
            صورت سوال
          </div>
          {competition.description}
        </div>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 rounded-full grid place-items-center text-white text-xl font-bold bg-gradient-to-br from-emerald-500 to-emerald-600">
            ✓
          </div>
          <div>
            <div className="font-bold text-emerald-800">پاسخ تیم ثبت شد</div>
            <div className="text-xs text-muted">{remaining <= 0 ? "مسابقه تمام شد" : "منتظر پایان مسابقه باشید"}</div>
          </div>
        </div>
        <div className="text-[11px] font-bold text-muted uppercase mb-1.5 flex items-center gap-1.5">
          <Icon name="code" className="w-4 h-4" />
          کد ارسالی تیم
        </div>
        <pre className="bg-[#0b1020] text-emerald-200 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap" dir="ltr">
          {teamSubmission.code || "(خالی)"}
        </pre>
      </div>
    );
  }

  if (remaining <= 0) {
    return (
      <div className="text-center py-16 text-muted flex items-center justify-center gap-2">
        <Icon name="clock" className="w-5 h-5" />
        زمان مسابقه تموم شده
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <span className="text-white text-xs font-bold px-3 py-1 rounded-full inline-flex items-center gap-1.5" style={{ background: currentTeam.color }}>
          <Icon name="flag" className="w-4 h-4" />
          تیم: {currentTeam.name}
        </span>
        <span className="text-xs text-muted">هر عضوی از تیم می‌تونه پاسخ رو بفرسته — بعد از ارسال همه‌ی اعضا می‌بیننش</span>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-4 text-center">
        <div className="bg-slate-50 rounded-lg py-2.5">
          <div className="text-lg font-extrabold">{fmtClock(remaining)}</div>
          <div className="text-[11px] text-muted">زمان باقی‌مانده</div>
        </div>
        <div className="bg-slate-50 rounded-lg py-2.5">
          <div className="text-lg font-extrabold">{competition.time_limit}</div>
          <div className="text-[11px] text-muted">دقیقه کل</div>
        </div>
      </div>
      <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-sm text-indigo-900 mb-4 whitespace-pre-wrap">
        <div className="font-bold text-xs mb-1 inline-flex items-center gap-1.5">
          <Icon name="list" className="w-4 h-4" />
          صورت سوال
        </div>
        {competition.description}
      </div>
      <CodeMirror
        value={code}
        onChange={setCode}
        theme={dracula}
        height="260px"
        extensions={extensions}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button
        onClick={() => submit()}
        disabled={submitting}
        className="w-full mt-4 py-3 rounded-lg text-sm font-bold text-white bg-gradient-to-br from-primary to-primary2 disabled:opacity-50 inline-flex items-center justify-center gap-2"
      >
        <Icon name="upload" className="w-4 h-4" /> ارسال پاسخ تیم (Ctrl+Enter)
      </button>
    </div>
  );
}
