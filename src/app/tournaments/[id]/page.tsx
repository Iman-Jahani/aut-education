import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function TournamentDetailPage({ params }: { params: { id: string } }) {
  const [tournament, setTournament] = useState<any | null>(null);
  const [participants, setParticipants] = useState<Array<any>>([]);
  const [battles, setBattles] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myParticipant, setMyParticipant] = useState<boolean | null>(null); // null = unknown, true = joined, false = not joined
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
      const pRes = await fetch(`/api/tournament/${params.id}/participants`); // We need to create this endpoint
      // For now we'll skip; we can fetch from tournament_participants via filter
      // Let's do a direct query using supabase? We'll create a simple API later.
      // We'll leave participants empty for now.
      // Fetch battles
      const bRes = await fetch(`/api/tournament/${params.id}/battles`); // also need endpoint
      if (bRes.ok) {
        const bData = await bRes.json();
        setBattles(bData.battles ?? []);
      }

      // Check if current user is participant
      const userRes = await fetch(`/api/me`); // we don't have /me endpoint; we can use supabase client? We'll skip for now.
      // We'll set myParticipant to false placeholder.
      setMyParticipant(false);
    } catch (err: any) {
      setError(err.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  function handleJoin() {
    // TODO: call POST /api/tournament/${params.id}/join
    // For now just refetch
    fetchData();
  }

  function handleLeave() {
    // TODO: call DELETE
    fetchData();
  }

  if (loading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;
  if (!tournament) return <div className="p-6">Tournament not found</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">{tournament.title}</h1>
        <div className="text-sm text-gray-500">
          وضعیت: {tournament.status}
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
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-2">شرکت‌کنندگان</h2>
        {participants.length === 0 ? (
          <p className="text-gray-600">هیچ شرکت‌کننده‌ای ثبت نشده است.</p>
        ) : (
          <ul className="space-y-1">
            {participants.map((p) => (
              <li key={p.id} className="flex justify-between">
                <span>{p.user_id}</span>
                <span className="text-sm">{p.joined_at}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-2">مبارزات</h2>
        {battles.length === 0 ? (
          <p className="text-gray-600">هیچ مبارزتی ایجاد نشده است.</p>
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        {tournament.status === 'registering' && (
          <>
            {myParticipant ? (
              <button onClick={handleLeave} className="btn btn-warning px-4 py-2 rounded">
                انصراف
              </button>
            ) : (
              <button onClick={handleJoin} className="btn btn-success px-4 py-2 rounded">
                ثبت‌نام
              </button>
            )}
          </>
        )}
        {/* Only teacher can start/advance */}
        {/* We'll hide for now */}
        <Link href={`/teacher/tournaments/${tournament.id}`} className="btn btn-primary px-4 py-2 rounded">
          مدیریت توسط معلم
        </Link>
      </div>
    </div>
  );
}