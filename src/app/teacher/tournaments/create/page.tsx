"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function TeacherTournamentCreatePage() {
  const [form, setForm] = useState({
    title: '',
    description: '',
    class_id: '',
    time_limit: 300,
    max_participants: 8,
    is_group_stage: false,
    group_size: 8,
    question_mode: 'random',
    fixed_question_id: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const router = useRouter();

  // Fetch list of classes for dropdown (we don't have API; we can get from class_sessions via supabase directly)
  // We'll skip for now and just input class_id manually.

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    // Validate
    if (!form.title.trim() || !form.class_id.trim()) {
      setError('title و class_id الزامی هستند');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/tournament`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          class_id: form.class_id,
          time_limit: form.time_limit,
          max_participants: form.max_participants,
          is_group_stage: form.is_group_stage,
          group_size: form.is_group_stage ? form.group_size : null,
          question_mode: form.question_mode,
          fixed_question_id: form.fixed_question_id || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create');
      }

      const data = await res.json();
      setSuccess(true);
      // Redirect to tournament detail after a short delay
      setTimeout(() => {
        router.push(`/teacher/tournaments/${data.tournament.id}`);
      }, 1500);
    } catch (err: any) {
      setError(err.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">ایجاد تورنمنت جدید</h1>
      {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded">{error}</div>}
      {success && <div className="mb-4 p-3 bg-green-50 text-green-600 rounded">تورنمنت با موفقیت ایجاد شد.</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">عنوان</label>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded"
            placeholder="عنوان تورنمنت"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">توضیحات</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded"
            rows={4}
            placeholder="توضیحات تورنمنت"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">کد کلاس</label>
          <input
            value={form.class_id}
            onChange={(e) => setForm({ ...form, class_id: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded"
            placeholder="کد کلاس (مثلاً CS101)"
            required
          />
        </div>
        <div className="flex items-baseline gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">محدودیت زمان (ثانیه)</label>
            <input
              type="number"
              value={form.time_limit}
              onChange={(e) => setForm({ ...form, time_limit: Number(e.target.value) || 300 })}
              className="w-full px-3 py-2 border border-gray-300 rounded"
              min="30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">حداکثر شرکت‌کنندگان</label>
            <select
              value={String(form.max_participants)}
              onChange={(e) => setForm({ ...form, max_participants: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded"
            >
              <option value="8">8</option>
              <option value="16">16</option>
              <option value="32">32</option>
              <option value="64">64</option>
            </select>
          </div>
        </div>
        <div className="flex items-baseline gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              <input
                type="checkbox"
                checked={form.is_group_stage}
                onChange={(e) =>
                  setForm({
                    ...form,
                    is_group_stage: e.target.checked,
                    group_size: e.target.checked ? 8 : form.group_size,
                  })
                }
              />
              مرحله گروهی
            </label>
          </div>
          {form.is_group_stage && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">اندازه گروه</label>
                <select
                  value={String(form.group_size)}
                  onChange={(e) =>
                    setForm({ ...form, group_size: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                >
                  <option value="6">6</option>
                  <option value="8">8</option>
                  <option value="10">10</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">حالت انتخاب سوال</label>
                <select
                  value={form.question_mode}
                  onChange={(e) => setForm({ ...form, question_mode: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                >
                  <option value="random">تصادفی</option>
                  <option value="difficulty_based">بر اساس دشواری</option>
                  <option value="fixed">ثابت</option>
                </select>
              </div>
              {form.question_mode === 'fixed' && (
                <div>
                  <label className="block text-sm font-medium mb-1">سوال ثابت (ID)</label>
                  <input
                    value={form.fixed_question_id}
                    onChange={(e) => setForm({ ...form, fixed_question_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                    placeholder="ID سوال از بانک سوال"
                  />
                </div>
              )}
            </>
          )}
        </div>
        <div>
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-primary text-white rounded hover:bg-primary/90"
          >
            {loading ? 'در حال ایجاد...' : 'ایجاد تورنمنت'}
          </button>
        </div>
      </form>
      <div className="mt-6">
        <Link href="/teacher/tournaments" className="text-sm">
          ← به لیست تورنمنت‌ها برگردン
        </Link>
      </div>
    </div>
  );
}