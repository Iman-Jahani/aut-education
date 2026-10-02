import { NextRequest, NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DAILY_LIMIT = 10;
const TIME_OPTIONS = [180, 300, 600];

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function dailyCount(supabase: any, userId: string) {
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count, error } = await supabase
    .from('battles')
    .select('id', { count: 'exact', head: true })
    .or(`host_id.eq.${userId},guest_id.eq.${userId}`)
    .gte('created_at', dayAgo);
  if (error) return { count: 0, error };
  return { count: count ?? 0, error: null };
}

export async function GET() {
  const supabase = serverSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('ابتدا وارد شوید', 401);

  const active = await supabase
    .from('battles')
    .select('*')
    .or(`host_id.eq.${user.id},guest_id.eq.${user.id}`)
    .in('status', ['waiting', 'ready', 'active'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const stats = await supabase.rpc('battle_stats', { p_user_id: user.id }).maybeSingle();
  return NextResponse.json({
    battle: active.data ?? null,
    stats: stats.data ?? { played: 0, wins: 0, losses: 0, draws: 0, xp: 0 },
  });
}

export async function POST(req: NextRequest) {
  const supabase = serverSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('ابتدا وارد شوید', 401);

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || '');

  if (action === 'leave') {
    await supabase.from('battle_queue').delete().eq('user_id', user.id);
    return NextResponse.json({ ok: true });
  }

  const { count } = await dailyCount(supabase, user.id);
  if (count >= DAILY_LIMIT) {
    return fail(`سقف ${DAILY_LIMIT} نبرد در ۲۴ ساعت پر شده. کمی بعد برگرد.`, 429);
  }

  if (action === 'quick') {
    const classId = String(body?.class_id || '');
    if (!classId) return fail('کلاس انتخاب نشده است.');
    const { data, error } = await supabase.rpc('find_quick_match', { p_class_id: classId });
    if (error) return fail('خطا در جست‌وجوی حریف: ' + error.message, 500);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.battle_id) return NextResponse.json({ queued: true });
    const { data: battle } = await supabase.from('battles').select('*').eq('id', row.battle_id).maybeSingle();
    return NextResponse.json({ battle });
  }

  if (action === 'create') {
    const classId = String(body?.class_id || '');
    const timeLimit = TIME_OPTIONS.includes(Number(body?.time_limit)) ? Number(body.time_limit) : 300;
    let exerciseId = body?.exercise_id ? String(body.exercise_id) : null;
    if (!classId) return fail('کلاس انتخاب نشده است.');
    // بدون تمرین انتخابی، یک تمرین تصادفی از همان کلاس بردار (وگرنه میدان خالی می‌ماند)
    if (!exerciseId) {
      const { data: pool } = await supabase.from('exercises').select('id').eq('class_id', classId).limit(50);
      const list = (pool ?? []) as { id: string }[];
      if (list.length) exerciseId = list[Math.floor(Math.random() * list.length)].id;
    }
    const { data: code, error: codeErr } = await supabase.rpc('generate_room_code');
    if (codeErr || !code) return fail('ساخت کد اتاق ناموفق بود. فایل BATTLE.sql اجرا شده؟', 500);
    const { data: battle, error } = await supabase.from('battles').insert({
      class_id: classId,
      exercise_id: exerciseId,
      host_id: user.id,
      room_code: code,
      status: 'waiting',
      time_limit: timeLimit,
      host_ready: false,
      guest_ready: false,
      host_last_ping: new Date().toISOString(),
    }).select().single();
    if (error || !battle) return fail('ساخت اتاق ناموفق بود: ' + (error?.message || ''), 400);
    return NextResponse.json({ battle });
  }

  if (action === 'join') {
    const roomCode = String(body?.room_code || '').trim().toUpperCase();
    if (!roomCode) return fail('کد اتاق را وارد کن.');
    const { data, error } = await supabase.rpc('join_battle_by_code', { p_room_code: roomCode });
    if (error) return fail('خطا در ورود: ' + error.message, 500);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.battle_id) return fail(row?.error || 'ورود به اتاق ناموفق بود.');
    const { data: battle } = await supabase.from('battles').select('*').eq('id', row.battle_id).maybeSingle();
    return NextResponse.json({ battle });
  }

  return fail('درخواست نامعتبر');
}
