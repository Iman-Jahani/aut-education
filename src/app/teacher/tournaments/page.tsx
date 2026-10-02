import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function TeacherTournamentsPage() {
  const [tournaments, setTournaments] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchTournaments();
  }, []);

  async function fetchTournaments() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournament`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch');
      }
      const data = await res.json();
      setTournaments(data.tournaments ?? []);
    } catch (err: any) {
      setError(err.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  function handleCreate() {
    router.push('/teacher/tournaments/create');
  }

  if (loading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">تورنمنت‌های من</h1>
        <Link href="/teacher/tournaments/create" className="btn btn-primary px-4 py-2 rounded">
          ایجاد تورنمنت جدید
        </Link>
      </div>
      {tournaments.length === 0 ? (
        <p className="text-gray-600">هیچ تورنمنتی یافت نشد.</p>
      ) : (
        <div className="space-y-4">
          {tournaments.map((t) => (
            <div key={t.id} className="border rounded-lg p-4 bg-gray-50">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="font-semibold">{t.title}</h2>
                  <p className="text-sm text-gray-500">{t.description}</p>
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <span>کلاس: {t.class_id}</span>
                    <span className="mx-1">|</span>
                    <span>وضعیت: {t.status}</span>
                    <span className="mx-1">|</span>
                    <span>شرکت‌کنندگان: {t.current_participants ?? 0}/{t.max_participants}</span>
                    <span className="mx-1">|</span>
                    <span>دور: {t.current_round}</span>
                  </div>
                </div>
                <div className="text-right">
                  <Link
                    href={`/teacher/tournaments/${t.id}`}
                    className="btn btn-secondary px-4 py-2 rounded"
                  >
                    مدیریت
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}