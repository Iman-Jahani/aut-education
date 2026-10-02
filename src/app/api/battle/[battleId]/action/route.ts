import { NextRequest, NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabaseServer';
import { finalizeBattle, isParticipant, loadBattleBundle } from '../shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// actions: ready | start | submit | rematch | cancel
export async function POST(req: NextRequest, { params }: { params: { battleId: string } }) {
  const supabase = serverSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || '');
  const bundle = await loadBattleBundle(supabase, params.battleId, user.id);
  if (!bundle) return NextResponse.json({ error: 'نبرد پیدا نشد' }, { status: 404 });
  let { battle } = bundle;
  if (!isParticipant(battle, user.id))
    return NextResponse.json({ error: 'شما در این نبرد نیستید' }, { status: 403 });
  const isHost = battle.host_id === user.id;

  if (action === 'ready') {
    if (!['waiting', 'ready'].includes(battle.status))
      return NextResponse.json({ error: 'این نبرد قابل آماده شدن نیست' }, { status: 400 });
    const patch = isHost ? { host_ready: true } : { guest_ready: true };
    const next: Record<string, unknown> = { ...patch, status: 'ready' };
    // شروع فوری وقتی هر دو آماده‌اند
    const otherReady = isHost ? battle.guest_ready : battle.host_ready;
    if (otherReady) {
      next.status = 'active';
      next.started_at = new Date().toISOString();
    }
    const { data, error } = await supabase.from('battles').update(next).eq('id', battle.id).select().single();
    if (error) return NextResponse.json({ error: 'خطا: ' + error.message }, { status: 400 });
    return NextResponse.json({ battle: data });
  }

  if (action === 'start') {
    if (!isHost) return NextResponse.json({ error: 'فقط میزبان می‌تواند شروع کند' }, { status: 403 });
    if (!battle.guest_id) return NextResponse.json({ error: 'هنوز حریفی نیامده' }, { status: 400 });
    const { data, error } = await supabase.from('battles').update({
      status: 'active', host_ready: true, guest_ready: true, started_at: new Date().toISOString(),
    }).eq('id', battle.id).select().single();
    if (error) return NextResponse.json({ error: 'خطا: ' + error.message }, { status: 400 });
    return NextResponse.json({ battle: data });
  }

  if (action === 'submit') {
    if (battle.status !== 'active')
      return NextResponse.json({ error: 'نبرد فعال نیست' }, { status: 400 });
    const passed = Math.max(0, Number(body?.passed_tests ?? 0));
    const total = Math.max(0, Number(body?.total_tests ?? 0));
    const code = String(body?.code ?? '');
    const isFinal = body?.is_final === true;
    const results = Array.isArray(body?.test_results) ? body.test_results : [];
    const up = await supabase.from('battle_submissions').upsert(
      {
        battle_id: battle.id, user_id: user.id, code,
        passed_tests: passed, total_tests: total, test_results: results,
        is_final: isFinal, submitted_at: new Date().toISOString(),
      },
      { onConflict: 'battle_id,user_id' }
    );
    if (up.error) return NextResponse.json({ error: 'ثبت نتیجه ناموفق بود: ' + up.error.message }, { status: 400 });

    // برد فوری: پاس کردن همه‌ی تست‌ها
    if (total > 0 && passed >= total) {
      const fin = await supabase.from('battles').update({
        status: 'finished', winner_id: user.id, finished_at: new Date().toISOString(),
      }).eq('id', battle.id).eq('status', 'active').select().single();
      if (fin.data) battle = fin.data;
      return NextResponse.json({ battle, finished: true, winner: user.id });
    }
    // ممکن است تایم‌اوت رخ داده باشد
    battle = await finalizeBattle(supabase, battle, user.id);
    return NextResponse.json({
      battle, finished: battle.status === 'finished', winner: battle.winner_id,
    });
  }

  if (action === 'rematch') {
    if (battle.status !== 'finished')
      return NextResponse.json({ error: 'فقط بعد از پایان می‌شود نبرد دوباره ساخت' }, { status: 400 });
    if (!battle.guest_id)
      return NextResponse.json({ error: 'حریف در اتاق نیست' }, { status: 400 });
    const exerciseId = body?.exercise_id ? String(body.exercise_id) : battle.exercise_id;
    const { data, error } = await supabase.from('battles').update({
      status: 'ready', exercise_id: exerciseId,
      host_ready: isHost, guest_ready: !isHost,
      host_last_ping: new Date().toISOString(),
      guest_last_ping: null, started_at: null, finished_at: null, winner_id: null,
    }).eq('id', battle.id).select().single();
    if (error) return NextResponse.json({ error: 'خطا: ' + error.message }, { status: 400 });
    // صفر کردن ارسال خودم (RLS اجازه‌ی نوشتن ردیف حریف را نمی‌دهد؛ امتیاز دور
    // قبل او با فیلتر زمانی در shared.ts نادیده گرفته می‌شود)
    await supabase.from('battle_submissions').upsert(
      {
        battle_id: battle.id,
        user_id: user.id,
        passed_tests: 0,
        total_tests: 0,
        test_results: [],
        is_final: false,
        code: '',
        submitted_at: new Date().toISOString(),
      },
      { onConflict: 'battle_id,user_id' }
    );
    return NextResponse.json({ battle: data });
  }

  if (action === 'cancel') {
    const { data, error } = await supabase.from('battles').update({ status: 'cancelled' }).eq('id', battle.id).select().single();
    if (error) return NextResponse.json({ error: 'خطا: ' + error.message }, { status: 400 });
    await supabase.from('battle_queue').delete().eq('user_id', user.id);
    return NextResponse.json({ battle: data });
  }

  return NextResponse.json({ error: 'درخواست نامعتبر' }, { status: 400 });
}
