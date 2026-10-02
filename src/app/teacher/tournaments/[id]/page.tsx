import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function TeacherTournamentDetailPage({ params }: { params: { id: string } }) {
  const [tournament, setTournament] = useState<any | null>(null);
  const [participants, setParticipants] = useState<Array<any>>([]);
  const [battles, setBattles] = useState<Array<any>>([]);
  [loading, setLoading] = useState(true);
  [error, setError] = useState<string | null>(null);
  [activeBattle, setActiveBattle] = useState<any | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchData();
  }, [params.id]);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      // Fetch tournament
      const tRes = await fetch(`/api/tournament/${params.id}`);
      if (!tRes.ok) throw new Error('Failed to fetch tournament');
      const tData = await tRes.json();
      setTournament(tData.tournament);

      // Fetch participants
      const pRes = await fetch(`/api/tournament/${params.id}/participants`);
      if (pRes.ok) {
        const pData = await pRes.json();
        setParticipants(pData.participants ?? []);
      }

      // Fetch battles
      const bRes = await fetch(`/api/tournament/${params.id}/battles`);
      if (bRes.ok) {
        const bData = await bRes.json();
        setBattles(bData.battles ?? []);
        // Find active battle
        const active = bData.battles?.find((b: any) => b.status === 'active');
        setActiveBattle(active ?? null);
      }
    } catch (err: any) {
      setError(err.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function handleStart() {
    if (!window.confirm('آیا مطمئنید که می‌خواهید تورنمنت را شروع کنید؟')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tournament/${params.id}/start`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to start');
      }
      // Refresh data
      await fetchData();
    } catch (err: any) {
      setError(err.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function handleAdvance() {
    if (!window.confirm('آیا مطمئنید که می‌خواهید دور را پیش ببرید؟')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tournament/${params.id}/advance`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to advance');
      }
      await fetchData();
    } catch (err: any) {
      setError(err.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;
  if (!tournament) return <div className="p-6">Tournament not found</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">{tournament.title}</h1>
        <div className="text-sm text-gray-500">
          ID: {tournament.id}
        </div>
      </div>

      <div className="mb-6 p-4 bg-gray-50 rounded">
        <p className="text-gray-700">{tournament.description}</p>
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          <span>زمان limitado: {tournament.time_limit} ثانیه</span>
          <span>حداکثر شرکت‌کنندگان: {tournament.max_participants}</span>
          {tournament.is_group_stage && (
            <>
              <span>مرحله گروهی: بله</span>
              <span>اندازه گروه: {tournament.group_size}</span>
              <span>تعداد گروه‌ها: {tournament.groups_count}</span>
            </>
          )}
          <span>حالت سوال: {tournament.question_mode}</span>
          {tournament.fixed_question_id && (
            <span>سوال ثابت: {tournament.fixed_question_id}</span>
          )}
          <span>وضعیت: {tournament.status}</span>
          <span className="mx-2">|</span>
          <span>دور فعلی: {tournament.current_round}</span>
          <span className="mx-2">|</span>
          <span>مرحله فعلی: {tournament.current_stage}</span>
          {tournament.winner_id && (
            <>
              <span className="mx-2">|</span>
              <span>برنده: {tournament.winner_id}</span>
            </>
          )}
        </div>
      </div>

      {tournament.status === 'registering' && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">شرکت‌کنندگان</h2>
          {participants.length === 0 ? (
            <p className="text-gray-600">هیچ شرکت‌کننده‌ای ثبت نشده است.</p>
          ) : (
            <div className="space-y-1">
              {participants.map((p) => (
                <div key={p.id} className="flex justify-between">
                  <span>{p.user_id}</span>
                  <span className="text-sm">{p.joined_at}</span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-sm text-gray-500">
            {participants.length}/{tournament.max_participants} 자리 پر شده است
          </p>
        </div>
      )}

      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-2">مبارزات</h2>
        {battles.length === 0 ? (
          <p className="text-gray-600">هیچ مبارزتی وجود ندارد.</p>
        ) : (
          <div className="space-y-2">
            {battles.map((b) => (
              <div key={b.id} className="border p-3 rounded">
                <div className="flex justify-between text-sm">
                  <span>دور: {b.round_number}</span>
                  <span>مرحله: {b.stage}</span>
                  {b.group_number !== null && (
                    <span>گروه: {b.group_number}</span>
                  )}
                </div>
                <div className="mt-2">
                  <span>میزبان: {b.host_id}</span> vs <span>مهمان: {b.guest_id}</span>
                </div>
                <div className="mt-1 text-xs">
                  وضعیت: {b.status}
                  {b.winner_id && (
                    <span className="ml-2 text-sm">برنده: {b.winner_id}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {activeBattle && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">مبارز فعال</h2>
          <div className="p-4 bg-blue-50 rounded">
            <div className="flex justify-between text-sm">
              <span>دور: {activeBattle.round_number}</span>
              <span>مرحله: {activeBattle.stage}</span>
              {activeBattle.group_number !== null && (
                <span>گروه: {activeBattle.group_number}</span>
              )}
            </div>
            <div className="mt-2">
              <span>میزبان: {activeBattle.host_id}</span> vs <span>مهمان: {activeBattle.guest_id}</span>
            </div>
            <div className="mt-1 text-xs">
              سوال: {activeBattle.battle_question_id}
            </div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-2">عملیات</h2>
        <div className="flex gap-3">
          {tournament.status === 'registering' && (
            <button
              onClick={handleStart}
              disabled={loading}
              className="btn btn-success px-4 py-2 rounded"
            >
              شروع تورنمنت
            </button>
          )}
          {(tournament.status === 'active' || tournament.status === 'finished') && (
            <button
              onClick={handleAdvance}
              disabled={loading}
              className="btn btn-warning px-4 py-2 rounded"
            >
              پیشبرد دور
            </button>
          )}
          <Link
            href={`/teacher/tournaments`}
            className="btn btn-secondary px-4 py-2 rounded"
          >
            به لیست برگردن
          </Link>
        </div>
      </div>
    </div>
  );
}