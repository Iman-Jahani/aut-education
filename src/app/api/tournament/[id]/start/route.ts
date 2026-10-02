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

  // Verify tournament belongs to teacher
  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .select('teacher_id, status')
    .eq('id', params.id)
    .single();
  if (tErr || !tournament) {
    return NextResponse.json({ error: 'تورنمنت یافت نشد' }, { status: 404 });
  }
  if (tournament.teacher_id !== user.id) {
    return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 });
  }
  if (tournament.status !== 'registering') {
    return NextResponse.json(
      { error: 'تورنمنت در وضعیت ثبت‌نام نیست؛ نمی‌توان شروع کرد' },
      { status: 400 }
    );
  }

  // Call the stored procedure
  const { error } = await supabase.rpc('start_tournament', {
    p_tournament_id: params.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}