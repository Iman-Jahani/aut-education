"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function TournamentsPage() {
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

  function handleJoin(tournamentId: string) {
    // In a real app we'd call POST /api/tournament/[id]/join
    // For now, just navigate to tournament detail page
    router.push(`/tournaments/${tournamentId}`);
  }

  if (loading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">تورنمنت‌ها</h1>
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
                  </div>
                </div>
                <div className="text-right">
                  <Link
                    href={`/tournaments/${t.id}`}
                    className="btn btn-primary px-4 py-2 rounded"
                  >
                    مشاهده
                  </Link>
                  {/* Join button only if tournament is registering */}
                  {t.status === 'registering' && (
                    <button
                      onClick={() => handleJoin(t.id)}
                      className="mt-2 btn btn-success px-4 py-2 rounded"
                    >
                      ثبت‌نام
                    </button>
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