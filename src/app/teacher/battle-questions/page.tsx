import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function TeacherBattleQuestionsPage() {
  const [questions, setQuestions] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    hint: '',
    difficulty: 'medium' as 'easy' | 'medium' | 'hard',
    test_cases: [] as Array<{ input: string; expected: string }>,
    tags: [] as string[],
    class_id: '',
  });

  useEffect(() => {
    fetchQuestions();
  }, []);

  async function fetchQuestions() {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Fetch questions where teacher_id = user.id
      const { data, error } = await supabase
        .from('battle_questions')
        .select('*')
        .eq('teacher_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setQuestions(data ?? []);
    } catch (err: any) {
      setError(err.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  function handleCreateOpen() {
    setCreating(true);
    // Reset form
    setForm({
      title: '',
      description: '',
      hint: '',
      difficulty: 'medium',
      test_cases: [],
      tags: [],
      class_id: '',
    });
  }

  function handleCreateClose() {
    setCreating(false);
  }

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('battle_questions')
        .insert({
          title: form.title,
          description: form.description,
          hint: form.hint,
          difficulty: form.difficulty,
          test_cases: form.test_cases,
          tags: form.tags,
          is_active: true,
          class_id: form.class_id,
          teacher_id: (await supabase.auth.getUser()).data.user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      await fetchQuestions();
      setCreating(false);
    } catch (err: any) {
      setError(err.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('آیا مطمئنید که می‌خواهید این سوال را حذف کنید؟')) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('battle_questions')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await fetchQuestions();
    } catch (err: any) {
      setError(err.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  function startEdit(id: string) {
    const q = questions.find((q) => q.id === id);
    if (q) {
      setEditId(id);
      setForm({
        title: q.title,
        description: q.description ?? '',
        hint: q.hint ?? '',
        difficulty: q.difficulty,
        test_cases: q.test_cases ?? [],
        tags: q.tags ?? [],
        class_id: q.class_id,
      });
    }
  }

  function stopEdit() {
    setEditId(null);
  }

  async function handleEditSubmit(e: React.FormEvent, id: string) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase
        .from('battle_questions')
        .update({
          title: form.title,
          description: form.description,
          hint: form.hint,
          difficulty: form.difficulty,
          test_cases: form.test_cases,
          tags: form.tags,
          // class_id and teacher_id should not be changed
        })
        .eq('id', id);

      if (error) throw error;
      await fetchQuestions();
      stopEdit();
    } catch (err: any) {
      setError(err.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">بانک سوال مسابقاتی</h1>
        <button
          onClick={handleCreateOpen}
          className="btn btn-primary px-4 py-2 rounded"
        >
          + ایجاد سوال جدید
        </button>
      </div>

      {/* Create form modal */}
      {creating && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl">
            <h2 className="text-xl font-semibold mb-4">ایجاد سوال جدید</h2>
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">عنوان</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">توضیحات</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">راهنمایی</label>
                <input
                  value={form.hint}
                  onChange={(e) => setForm({ ...form, hint: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                />
              </div>
              <div className="flex items-baseline gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">دشواری</label>
                  <select
                    value={form.difficulty}
                    onChange={(e) =>
                      setForm({ ...form, difficulty: e.target.value as any })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                  >
                    <option value="easy">آسان</option>
                    <option value="medium">متوسط</option>
                    <option value="hard">سخت</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">کلاس ID</label>
                  <input
                    value={form.class_id}
                    onChange={(e) => setForm({ ...form, class_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">تست‌کیس‌ها (JSON)</label>
                <textarea
                  value={JSON.stringify(form.test_cases, null, 2)}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      setForm({ ...form, test_cases: parsed });
                    } catch {
                      // ignore invalid JSON
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                  rows={4}
                  placeholder='[{"input":"...","expected":"..."}]'
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">برچسب‌ها (JSON array of strings)</label>
                <textarea
                  value={JSON.stringify(form.tags, null, 2)}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      setForm({ ...form, tags: parsed });
                    } catch {
                      // ignore
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                  rows={2}
                  placeholder='["tag1","tag2"]'
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleCreateClose}
                  className="mr-2 btn btn-secondary px-3 py-2 rounded"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-success px-3 py-2 rounded"
                >
                  ایجاد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Questions list */}
      {questions.length === 0 ? (
        <p className="text-gray-600">هیچ سوالی اضافه نشده است.</p>
      ) : (
        <div className="space-y-4">
          {questions.map((q) => (
            <div key={q.id} className="border rounded-lg p-4 bg-gray-50">
              <div className="flex justify-between items-start">
                <div>
                  {editId === q.id ? (
                    <form onSubmit={(e) => handleEditSubmit(e, q.id)} className="space-y-2">
                      <div>
                        <label className="block text-sm font-medium mb-1">عنوان</label>
                        <input
                          value={form.title}
                          onChange={(e) => setForm({ ...form, title: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">توضیحات</label>
                        <textarea
                          value={form.description}
                          onChange={(e) => setForm({ ...form, description: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded"
                          rows={2}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">راهنمایی</label>
                        <input
                          value={form.hint}
                          onChange={(e) => setForm({ ...form, hint: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded"
                        />
                      </div>
                      <div className="flex items-baseline gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-1">دشواری</label>
                          <select
                            value={form.difficulty}
                            onChange={(e) =>
                              setForm({ ...form, difficulty: e.target.value as any })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                          >
                            <option value="easy">آسان</option>
                            <option value="medium">متوسط</option>
                            <option value="hard">سخت</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">کلاس ID</label>
                          <input
                            value={form.class_id}
                            onChange={(e) => setForm({ ...form, class_id: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                          />
                        </div>
                      </div>
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={stopEdit}
                          className="mr-2 btn btn-secondary px-3 py-2 rounded"
                        >
                          انصراف
                        </button>
                        <button
                          type="submit"
                          disabled={loading}
                          className="btn btn-success px-3 py-2 rounded"
                        >
                          ذخیره
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div>
                      <h2 className="font-semibold">{q.title}</h2>
                      {q.description && <p className="text-sm text-gray-600 mt-1">{q.description}</p>}
                      {q.hint && (
                        <p className="text-sm text-blue-600 mt-1">
                          <span className="font-medium">راهنمایی:</span> {q.hint}
                        )
                      )}
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          {q.difficulty}
                        </span>
                        {q.class_id && (
                          <span className="ml-2 bg-gray-100 text-gray-800 px-2 py-1 rounded">
                            کلاس: {q.class_id}
                          >
                        )}
                        {q.tags.length > 0 && (
                          <>
                            {q.tags.map((tag) => (
                              <span key={tag} className="bg-green-100 text-green-800 px-2 py-1 rounded">
                                {tag}
                              >
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  {!editId && (
                    <>
                      <button
                        onClick={() => startEdit(q.id)}
                        className="btn btn-secondary px-3 py-2 rounded"
                      >
                        ویرایش
                      </button>
                      <button
                        onClick={() => handleDelete(q.id)}
                        className="ml-2 btn btn-error px-3 py-2 rounded"
                      >
                        حذف
                      </>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}