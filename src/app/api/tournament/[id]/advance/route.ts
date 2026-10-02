import { NextRequest, NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = serverSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 });
  }

  // Verify tournament belongs to teacher or user is a participant (as per SQL)
  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .select('teacher_id')
    .eq('id', params.id)
    .single();
  if (tErr || !tournament) {
    return NextResponse.json({ error: 'تورنمنت یافت نشد' }, { status: 404 });
  }
  // Allow teacher or any participant to call advance (as per SQL)
  const isTeacher = tournament.teacher_id === user.id;
  if (!isTeacher) {
    const { count, error: cErr } = await supabase
      .from('tournament_participants')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', params.id)
      .eq('user_id', user.id);
    if (cErr || (count ?? 0) <= 0) {
      return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 });
    }
  }

  // Call the stored procedure
  const { error } = await supabase.rpc('advance_tournament', {
    p_tournament_id: params.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}