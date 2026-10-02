import { NextRequest, NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getBattleQuestion(supabase: any, id: string) {
  const { data, error } = await supabase
    .from('battle_questions')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = serverSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 });
  }

  try {
    const question = await getBattleQuestion(supabase, params.id);
    return NextResponse.json({ question });
  } catch (err: any) {
    if (err.code === 'PGRST116') {
      return NextResponse.json({ error: 'سوال یافت نشد' }, { status: 404 });
    }
    return NextResponse.json({ error: err.message ?? 'خطای نامشخص' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = serverSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 });
  }

  // Only teacher of the question can update
  const { data: question, error: fetchErr } = await supabase
    .from('battle_questions')
    .select('teacher_id')
    .eq('id', params.id)
    .single();
  if (fetchErr || !question) {
    return NextResponse.json({ error: 'سوال یافت نشد' }, { status: 404 });
  }
  if (question.teacher_id !== user.id) {
    return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    title,
    description,
    hint,
    difficulty,
    test_cases,
    tags,
    is_active,
  } = body;

  const updates: any = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (hint !== undefined) updates.hint = hint;
  if (difficulty !== undefined) {
    const allowedDiff = ['easy', 'medium', 'hard'];
    if (!allowedDiff.includes(difficulty)) {
      return NextResponse.json(
        { error: 'difficulty باید easy، medium یا hard باشد' },
        { status: 400 }
      );
    }
    updates.difficulty = difficulty;
  }
  if (test_cases !== undefined) updates.test_cases = test_cases;
  if (tags !== undefined) updates.tags = tags;
  if (is_active !== undefined) updates.is_active = is_active;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'هیچ فیلدی برای ارسال نیست' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('battle_questions')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ question: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = serverSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 });
  }

  // Only teacher can delete
  const { data: question, error: fetchErr } = await supabase
    .from('battle_questions')
    .select('teacher_id')
    .eq('id', params.id)
    .single();
  if (fetchErr || !question) {
    return NextResponse.json({ error: 'سوال یافت نشد' }, { status: 404 });
  }
  if (question.teacher_id !== user.id) {
    return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 });
  }

  const { error } = await supabase
    .from('battle_questions')
    .delete()
    .eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}