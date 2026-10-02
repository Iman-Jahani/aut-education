import { NextRequest, NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = serverSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'ابتدا وارد شوید' }, { status: 401 });
  }

  // Optionally filter by user? Not needed.
  const { data, error } = await supabase
    .from('tournament_participants')
    .select('*')
    .eq('tournament_id', params.id)
    .order('joined_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ participants: data ?? [] });
}