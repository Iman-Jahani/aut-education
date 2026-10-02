import { NextRequest, NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getTournaments(supabase: any, classId?: string, status?: string) {
  let query = supabase.from('tournaments').select('*');
  if (classId) {
    query = query.eq('class_id', classId);
  }
  if (status) {
    query = query.eq('status', status);
  }
  query = query.order('created_at', { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function GET(req: NextRequest) {
  const supabase = serverSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const classId = searchParams.get('class_id') || undefined;
  const status = searchParams.get('status') || undefined;

  try {
    const tournaments = await getTournaments(supabase, classId, status);
    return NextResponse.json({ tournaments });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'خطای نامشخص' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = serverSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 });
  }

  // Only teachers can create tournaments
  const { data: profile, error: profileErr } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('user_id', user.id)
    .single();
  if (profileErr || !(profile?.role === 'teacher')) {
    return NextResponse.json({ error: 'فقط معلم می‌تواند تورنمنت بسازد' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    title,
    description = '',
    class_id,
    time_limit = 300,
    max_participants = 8,
    is_group_stage = false,
    group_size = 8,
    question_mode = 'random',
    fixed_question_id = null,
  } = body;

  if (!title || !class_id) {
    return NextResponse.json(
      { error: 'title و class_id الزامی هستند' },
      { status: 400 }
    );
  }

  // Validate max_participants
  const allowed = [8, 16, 32, 64];
  if (!allowed.includes(max_participants)) {
    return NextResponse.json(
      { error: 'max_participants باید ۸، ۱۶، ۳۲ یا ۶۴ باشد' },
      { status: 400 }
    );
  }
  // Validate group_size if is_group_stage
  if (is_group_stage) {
    const allowedGroup = [6, 8, 10];
    if (!allowedGroup.includes(group_size ?? 0)) {
      return NextResponse.json(
        { error: 'group_size باید ۶، ۸ یا ۱۰ باشد وقتی is_group_stage فعال است' },
        { status: 400 }
      );
    }
  }

  const { data: tournament, error } = await supabase
    .from('tournaments')
    .insert({
      title,
      description,
      class_id,
      time_limit,
      max_participants,
      is_group_stage,
      group_size: is_group_stage ? group_size : null,
      question_mode,
      fixed_question_id,
      status: 'registering',
      teacher_id: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ tournament });
}