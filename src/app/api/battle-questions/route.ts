import { NextRequest, NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getBattleQuestions(supabase: any, classId?: string, teacherId?: string, activeOnly?: boolean) {
  let query = supabase.from('battle_questions').select('*');
  if (classId) {
    query = query.eq('class_id', classId);
  }
  if (teacherId) {
    query = query.eq('teacher_id', teacherId);
  }
  if (activeOnly) {
    query = query.eq('is_active', true);
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
  const activeOnly = searchParams.get('active') === 'true';
  // Teachers can see their own questions; students can see questions of their classes
  // For simplicity, we allow all authenticated users to see questions of their classes.
  // We'll get the user's classes from their profile? Not stored. We'll rely on class_id param.
  // If no class_id, we can return empty or maybe all questions if teacher.
  let teacherId: string | undefined;
  if (!classId) {
    // If no class filter, maybe teacher wants to see their own questions
    const { data: profile, error: pErr } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();
    if (!pErr && profile?.role === 'teacher') {
      teacherId = user.id;
    }
  }

  try {
    const questions = await getBattleQuestions(supabase, classId, teacherId, activeOnly);
    return NextResponse.json({ questions });
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

  // Only teachers can create battle questions
  const { data: profile, error: pErr } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('user_id', user.id)
    .single();
  if (pErr || !(profile?.role === 'teacher')) {
    return NextResponse.json({ error: 'فقط معلم می‌تواند سوال مسابقه بسازد' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    title,
    description = '',
    hint = '',
    difficulty = 'medium',
    test_cases = [],
    tags = [],
    class_id,
  } = body;

  if (!title || !class_id) {
    return NextResponse.json(
      { error: 'title و class_id الزامی هستند' },
      { status: 400 }
    );
  }

  // Validate difficulty
  const allowedDiff = ['easy', 'medium', 'hard'];
  if (!allowedDiff.includes(difficulty)) {
    return NextResponse.json(
      { error: 'difficulty باید easy، medium یا hard باشد' },
      { status: 400 }
    );
  }

  const { data: question, error } = await supabase
    .from('battle_questions')
    .insert({
      title,
      description,
      hint,
      difficulty,
      test_cases,
      tags,
      is_active: true,
      class_id,
      teacher_id: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ question });
}