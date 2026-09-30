"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ToastProvider";
import Icon from "@/components/Icon";
import type { Competition } from "@/lib/types";

export default function CompetitionFormModal({
  classId,
  competition,
  onClose,
  onSaved,
}: {
  classId: string;
  competition?: Competition | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(competition?.title || "");
  const [description, setDescription] = useState(competition?.description || "");
  const [timeLimit, setTimeLimit] = useState(competition?.time_limit || 10);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const t = title.trim();
    const d = description.trim();
    if (!t) return toast("عنوان رو وارد کن", "err");
    if (!d) return toast("صورت سوال رو وارد کن", "err");
    setSaving(true);
    try {
      if (competition) {
        const { error } = await supabase
          .from("competitions")
          .update({ title: t, description: d, time_limit: timeLimit })
          .eq("id", competition.id);
        if (error) throw error;
        toast("ویرایش شد", "ok");
      } else {
        const { error } = await supabase
          .from("competitions")
          .insert({ class_id: classId, title: t, description: d, time_limit: timeLimit, status: "draft" });
        if (error) throw error;
        toast("مسابقه ساخته شد", "ok");
      }
      onSaved();
    } catch (e) {
      toast("خطا: " + (e as Error).message, "err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[115] bg-slate-900/50 backdrop-blur-sm anim-fade flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl anim-pop w-full max-w-lg p-6">
        <h2 className="font-extrabold mb-4 flex items-center gap-2">
          <Icon name={competition ? "edit" : "flag"} className="w-5 h-5 text-primary" />
          {competition ? "ویرایش مسابقه" : "مسابقه جدید"}
        </h2>
        <div className="space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="عنوان مسابقه"
            className="w-full border border-line rounded-lg px-3 py-2 outline-none focus:border-primary"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="صورت سوال… (چیزی که تیم‌ها باید کدش رو بنویسن)"
            rows={6}
            className="w-full border border-line rounded-lg px-3 py-2 outline-none focus:border-primary resize-none"
          />
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted whitespace-nowrap">زمان (دقیقه)</label>
            <input
              type="number"
              min={1}
              value={timeLimit}
              onChange={(e) => setTimeLimit(parseInt(e.target.value) || 10)}
              className="w-24 border border-line rounded-lg px-3 py-2 outline-none focus:border-primary"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold border border-line">
            لغو
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-bold text-white bg-gradient-to-br from-primary to-primary2 disabled:opacity-50"
          >
            {saving ? "در حال ذخیره…" : "ذخیره"}
          </button>
        </div>
      </div>
    </div>
  );
}
