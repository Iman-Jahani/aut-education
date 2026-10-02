import { NextRequest, NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getTournament(supabase: any, id: string) {
  const { data, error } = await supabase
    .from('tournaments')
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
    const tournament = await getTournament(supabase, params.id);
    return NextResponse.json({ tournament });
  } catch (err: any) {
    if (err.code === 'PGRST116') {
      return NextResponse.json({ error: 'تورنمنت یافت نشد' }, { status: 404 });
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

  // Only teacher of the tournament can update
  const { data: tournament, error: fetchErr } = await supabase
    .from('tournaments')
    .select('teacher_id')
    .eq('id', params.id)
    .single();
  if (fetchErr || !tournament) {
    return NextResponse.json({ error: 'تورنمنت یافت نشد' }, { status: 404 });
  }
  if (tournament.teacher_id !== user.id) {
    return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    title,
    description,
    time_limit,
    max_participants,
    is_group_stage,
    group_size,
    question_mode,
    fixed_question_id,
    status,
  } = body;

  // Build update object
  const updates: any = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (time_limit !== undefined) updates.time_limit = time_limit;
  if (max_participants !== undefined) {
    const allowed = [8, 16, 32, 64];
    if (!allowed.includes(max_participants)) {
      return NextResponse.json(
        { error: 'max_participants باید ۸، ۱۶، ۳۲ یا ۶۴ باشد' },
        { status: 400 }
      );
    }
    updates.max_participants = max_participants;
  }
  if (is_group_stage !== undefined) updates.is_group_stage = is_group_stage;
  if (group_size !== undefined) {
    if (is_group_stage) {
      const allowedGroup = [6, 8, 10];
      if (!allowedGroup.includes(group_size ?? 0)) {
        return NextResponse.json(
          { error: 'group_size باید ۶، ۸ یا ۱۰ باشد وقتی is_group_stage فعال است' },
          { status: 400 }
        );
      }
    }
    updates.group_size = is_group_stage ? group_size : null;
  }
  if (question_mode !== undefined) updates.question_mode = question_mode;
  if (fixed_question_id !== undefined) updates.fixed_question_id = fixed_question_id;
  if (status !== undefined) {
    const allowedStatus = ['registering', 'active', 'finished', 'cancelled'];
    if (!allowedStatus.includes(status)) {
      return NextResponse.json(
        { error: 'status نامعتبر' },
        { status: 400 }
      );
    }
    updates.status = status;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'هیچ فیلدی برای ارسال نیست' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('tournaments')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ tournament: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = serverSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 });
  }

  // Only teacher can delete
  const { data: tournament, error: fetchErr } = await supabase
    .from('tournaments')
    .select('teacher_id')
    .eq('id', params.id)
    .single();
  if (fetchErr || !tournament) {
    return NextResponse.json({ error: 'تورنمنت یافت نشد' }, { status: 404 });
  }
  if (tournament.teacher_id !== user.id) {
    return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 });
  }

  const { error } = await supabase
    .from('tournaments')
    .delete()
    .eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}