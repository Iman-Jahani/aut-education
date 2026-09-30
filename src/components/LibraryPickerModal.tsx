"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ToastProvider";
import { fmtRelative } from "@/lib/utils";
import type { SharedExercise } from "@/lib/types";
import { ListSkeleton } from "@/components/Skeleton";
import Icon from "@/components/Icon";

export default function LibraryPickerModal({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (ex: SharedExercise) => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<SharedExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("shared_exercises")
      .select("*")
      .order("use_count", { ascending: false })
      .order("created_at", { ascending: false });
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = q.trim()
    ? items.filter(
        (e) =>
          (e.title || "").toLowerCase().includes(q.toLowerCase()) ||
          (e.description || "").toLowerCase().includes(q.toLowerCase())
      )
    : items;

  const pick = async (ex: SharedExercise) => {
    onPick(ex);
    supabase
      .from("shared_exercises")
      .update({ use_count: (ex.use_count || 0) + 1 })
      .eq("id", ex.id)
      .then(() => undefined);
    toast("از کتابخانه بارگذاری شد", "ok");
  };

  const del = async (ex: SharedExercise) => {
    if (!confirm(`تمرین «${ex.title}» از کتابخانه حذف شود؟`)) return;
    const { error } = await supabase.from("shared_exercises").delete().eq("id", ex.id);
    if (error) return toast("خطا: " + error.message, "err");
    toast("حذف شد", "ok");
    load();
  };

  return (
    <div
      className="fixed inset-0 z-[120] bg-slate-900/50 backdrop-blur-sm anim-fade flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl anim-pop w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h2 className="font-extrabold inline-flex items-center gap-2">
            <Icon name="book" className="w-5 h-5" /> کتابخانه‌ی تمرین‌ها
          </h2>
          <button onClick={onClose} className="text-muted hover:text-ink inline-flex items-center" aria-label="بستن">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 pt-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجو…"
            className="w-full border border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-2">
          {loading ? (
            <ListSkeleton rows={4} pill={false} />
          ) : filtered.length === 0 ? (
            <div className="text-sm text-muted py-10 flex items-center justify-center gap-2">
              {items.length ? (
                "چیزی پیدا نشد"
              ) : (
                <>
                  <Icon name="book" className="w-4 h-4" /> کتابخانه خالیه
                </>
              )}
            </div>
          ) : (
            filtered.map((ex) => (
              <div
                key={ex.id}
                className="flex items-start gap-2 border border-line rounded-lg p-3 hover:border-primary/40 cursor-pointer"
                onClick={() => pick(ex)}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm flex items-center gap-1.5">
                    <Icon name="file" className="w-4 h-4 shrink-0" /> {ex.title}
                  </div>
                  {ex.description && <div className="text-xs text-muted line-clamp-2 mt-0.5">{ex.description}</div>}
                  <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted">
                    <span className="px-1.5 py-0.5 bg-slate-100 rounded">{(ex.test_cases || []).length} تست</span>
                    <span className="px-1.5 py-0.5 bg-slate-100 rounded">{ex.use_count || 0} بار</span>
                    <span className="mr-auto">
                      {ex.created_by_name || "ناشناس"} · {fmtRelative(ex.created_at)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    del(ex);
                  }}
                  className="text-danger text-sm shrink-0 inline-flex items-center"
                  title="حذف"
                  aria-label="حذف"
                >
                  <Icon name="trash" className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
