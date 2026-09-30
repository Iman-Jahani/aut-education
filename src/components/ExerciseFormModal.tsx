"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ToastProvider";
import Icon from "@/components/Icon";
import type { Exercise, TestCase } from "@/lib/types";

export default function ExerciseFormModal({
  classId,
  exercise,
  template,
  onClose,
  onSaved,
}: {
  classId: string;
  exercise?: Exercise | null;
  template?: { title: string; description: string; hint: string; test_cases: TestCase[] } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { displayName } = useAuth();
  const toast = useToast();
  const [title, setTitle] = useState(exercise?.title || template?.title || "");
  const [description, setDescription] = useState(exercise?.description || template?.description || "");
  const [hint, setHint] = useState(exercise?.hint || template?.hint || "");
  const [tests, setTests] = useState<TestCase[]>(
    exercise?.test_cases?.length
      ? exercise.test_cases
      : template?.test_cases?.length
      ? template.test_cases
      : [{ input: "", expected: "" }]
  );
  const [addToLibrary, setAddToLibrary] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAddToLibrary(false);
  }, [exercise]);

  const updateTest = (i: number, field: keyof TestCase, value: string) => {
    setTests((prev) => prev.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)));
  };
  const removeTest = (i: number) => setTests((prev) => prev.filter((_, idx) => idx !== i));
  const addTest = () => setTests((prev) => [...prev, { input: "", expected: "" }]);

  const save = async () => {
    const t = title.trim();
    if (!t) return toast("عنوان رو وارد کن", "err");
    const cleanTests = tests.map((tc) => ({ input: tc.input || "", expected: tc.expected || "" })).filter((tc) => tc.expected.trim() !== "");
    if (cleanTests.length === 0) return toast("حداقل یه تست با خروجی لازمه", "err");

    setSaving(true);
    try {
      if (exercise) {
        const { error } = await supabase
          .from("exercises")
          .update({ title: t, description, hint, test_cases: cleanTests, updated_at: new Date().toISOString() })
          .eq("id", exercise.id);
        if (error) throw error;
        if (addToLibrary) {
          if (exercise.shared_exercise_id) {
            await supabase
              .from("shared_exercises")
              .update({ title: t, description, hint, test_cases: cleanTests, created_by_name: displayName })
              .eq("id", exercise.shared_exercise_id);
            toast("ویرایش شد + کتابخانه به‌روز شد", "ok");
          } else {
            const { data: lib } = await supabase
              .from("shared_exercises")
              .insert({ title: t, description, hint, test_cases: cleanTests, created_by_name: displayName })
              .select()
              .single();
            if (lib) await supabase.from("exercises").update({ shared_exercise_id: lib.id }).eq("id", exercise.id);
            toast("ویرایش شد + به کتابخانه اضافه شد", "ok");
          }
        } else {
          toast("تمرین ویرایش شد", "ok");
        }
      } else {
        const { data: newEx, error } = await supabase
          .from("exercises")
          .insert({ class_id: classId, title: t, description, hint, test_cases: cleanTests })
          .select()
          .single();
        if (error) throw error;
        if (addToLibrary) {
          const { data: lib } = await supabase
            .from("shared_exercises")
            .insert({ title: t, description, hint, test_cases: cleanTests, created_by_name: displayName })
            .select()
            .single();
          if (lib && newEx) await supabase.from("exercises").update({ shared_exercise_id: lib.id }).eq("id", newEx.id);
          toast("ساخته شد + به کتابخانه اضافه شد", "ok");
        } else {
          toast("تمرین ساخته شد", "ok");
        }
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
      className="fixed inset-0 z-[110] bg-slate-900/50 backdrop-blur-sm anim-fade flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl anim-pop w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h2 className="font-extrabold inline-flex items-center gap-2">
            <Icon name={exercise ? "edit" : "file"} className="w-5 h-5" />
            {exercise ? "ویرایش تمرین" : "تمرین جدید"}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-ink inline-flex items-center" aria-label="بستن">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4 flex-1 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="عنوان تمرین"
            className="w-full border border-line rounded-lg px-3 py-2 outline-none focus:border-primary"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="توضیح تمرین (اختیاری)"
            rows={3}
            className="w-full border border-line rounded-lg px-3 py-2 outline-none focus:border-primary resize-none"
          />
          <input
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="راهنمایی (اختیاری)"
            className="w-full border border-line rounded-lg px-3 py-2 outline-none focus:border-primary"
          />

          <div className="flex items-center justify-between pt-2">
            <span className="text-sm font-bold text-muted">تست‌ها</span>
            <button onClick={addTest} className="text-xs font-bold text-primary">
              + تست جدید
            </button>
          </div>

          {tests.map((tc, i) => (
            <div key={i} className="border border-line rounded-lg p-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold">تست {i + 1}</span>
                {tests.length > 1 && (
                  <button onClick={() => removeTest(i)} className="text-danger text-xs">
                    حذف ×
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted block mb-1">ورودی (stdin)</label>
                  <textarea
                    value={tc.input}
                    onChange={(e) => updateTest(i, "input", e.target.value)}
                    rows={2}
                    className="w-full border border-line rounded-lg px-2 py-1.5 text-xs font-mono outline-none focus:border-primary resize-none"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted block mb-1">خروجی مورد انتظار</label>
                  <textarea
                    value={tc.expected}
                    onChange={(e) => updateTest(i, "expected", e.target.value)}
                    rows={2}
                    className="w-full border border-line rounded-lg px-2 py-1.5 text-xs font-mono outline-none focus:border-primary resize-none"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>
          ))}

          <label className="flex items-center gap-2 text-sm pt-2 cursor-pointer">
            <input type="checkbox" checked={addToLibrary} onChange={(e) => setAddToLibrary(e.target.checked)} />
            <Icon name={exercise?.shared_exercise_id ? "refresh" : "book"} className="w-4 h-4 shrink-0" />
            {exercise?.shared_exercise_id
              ? "نسخه‌ی کتابخانه رو با تغییرات فعلی به‌روزرسانی کن"
              : "این تمرین رو به کتابخانه اشتراکی اضافه کن"}
          </label>
        </div>

        <div className="px-6 py-4 border-t border-line flex justify-end gap-2">
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
