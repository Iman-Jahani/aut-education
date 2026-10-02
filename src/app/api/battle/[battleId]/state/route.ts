import { NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabaseServer';
import { finalizeBattle, isParticipant, loadBattleBundle } from '../shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// هر ۲ ثانیه از کلاینت صدا زده می‌شود: پینگ، شروع خودکار، timeout، walkover.
export async function GET(_req: Request, { params }: { params: { battleId: string } }) {
  const supabase = serverSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 });

  const bundle = await loadBattleBundle(supabase, params.battleId, user.id);
  if (!bundle) return NextResponse.json({ error: 'نبرد پیدا نشد' }, { status: 404 });
  const { battle } = bundle;
  if (!isParticipant(battle, user.id))
    return NextResponse.json({ error: 'شما در این نبرد نیستید' }, { status: 403 });

  // ۱) پینگ
  const pingCol = battle.host_id === user.id ? 'host_last_ping' : 'guest_last_ping';
  await supabase.from('battles').update({ [pingCol]: new Date().toISOString() }).eq('id', battle.id);

  // ۲) شروع خودکار وقتی هر دو آماده‌اند
  let current = battle;
  if (battle.status === 'ready' && battle.host_ready && battle.guest_ready) {
    const upd = await supabase
      .from('battles')
      .update({ status: 'active', started_at: new Date().toISOString() })
      .eq('id', battle.id)
      .select()
      .single();
    if (upd.data) current = upd.data;
  }

  // ۳) پایان خودکار (timeout / walkover) با قوانین مشترک
  current = await finalizeBattle(supabase, current, user.id);

  const fresh = await loadBattleBundle(supabase, current.id, user.id);
  return NextResponse.json(fresh);
}
