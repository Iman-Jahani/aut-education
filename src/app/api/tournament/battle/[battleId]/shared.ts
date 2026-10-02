// Shared server-side logic for tournament battles (state + submit routes).
// Deterministic winner rules, timeout finalisation and bracket advancement.
import type {
  BattlePlayer,
  BattleQuestion,
  Tournament,
  TournamentBattle,
  TournamentBattleState,
} from "@/lib/types";

/** شمارش معکوس سرور-کلاینت (مثل 1v1). */
export const COUNTDOWN_MS = 3000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

export function isParticipant(battle: TournamentBattle, userId: string): boolean {
  return battle.host_id === userId || battle.guest_id === userId;
}

/**
 * قوانین برنده‌شدن (همان 1v1):
 *  1) تعداد تست پاس‌شده‌ی بیشتر
 *  2) در تساوی → زودتر رسیدن به نتیجه (submitted_at کوچک‌تر)
 *  3) باز هم مساوی/بدون ارسال → میزبان (براکت به برنده نیاز دارد)
 */
export function pickWinner(
  battle: TournamentBattle,
  subs: { user_id: string; passed_tests: number; submitted_at: string }[]
): string {
  const h = subs.find((s) => s.user_id === battle.host_id);
  const g = subs.find((s) => s.user_id === battle.guest_id);
  const hp = h?.passed_tests ?? 0;
  const gp = g?.passed_tests ?? 0;
  if (hp !== gp) return hp > gp ? battle.host_id : battle.guest_id;
  const ht = h ? new Date(h.submitted_at).getTime() : Number.MAX_SAFE_INTEGER;
  const gt = g ? new Date(g.submitted_at).getTime() : Number.MAX_SAFE_INTEGER;
  if (ht !== gt) return ht <= gt ? battle.host_id : battle.guest_id;
  return battle.host_id;
}

/** پایان نبرد (timeout یا ارسال کامل) + پیشبرد براکت تورنمنت. */
export async function finishTournamentBattle(
  supabase: SB,
  battle: TournamentBattle,
  winnerId: string
): Promise<TournamentBattle> {
  if (battle.status === "finished") return battle;

  const upd = await supabase
    .from("tournament_battles")
    .update({ status: "finished", winner_id: winnerId, finished_at: new Date().toISOString() })
    .eq("id", battle.id)
    .eq("status", "active")
    .select()
    .single();
  const finished = (upd.data as TournamentBattle) ?? battle;

  // براکت را یک قدم جلو ببر؛ خطای آن مانع پایان نبرد نمی‌شود (فعلاً ممکن است
  // نبرد دیگری از همان نوبت تمام نشده باشد — پس خطا نده، فقط ادامه بده).
  try {
    const { error } = await supabase.rpc("advance_tournament", {
      p_tournament_id: battle.tournament_id,
    });
    if (error) console.error("advance_tournament:", error.message);
  } catch (e) {
    console.error("advance_tournament failed:", e);
  }
  return finished;
}

/** اگر زمان تمام شده باشد، نبرد را با مقایسه‌ی ارسال‌ها پایان می‌دهد. */
export async function finalizeIfTimeout(
  supabase: SB,
  battle: TournamentBattle,
  userId: string
): Promise<TournamentBattle> {
  if (battle.status !== "active" || !battle.started_at) return battle;
  const elapsed = Date.now() - new Date(battle.started_at).getTime() - COUNTDOWN_MS;
  if (elapsed < battle.time_limit * 1000) return battle;

  const { data } = await supabase
    .from("tournament_battle_submissions")
    .select("user_id, passed_tests, submitted_at")
    .eq("battle_id", battle.id);
  const subs = (data ?? []) as { user_id: string; passed_tests: number; submitted_at: string }[];
  const winner = pickWinner(battle, subs);
  console.log("tournament battle", battle.id, "timeout → winner", winner, "by", userId);
  return finishTournamentBattle(supabase, battle, winner);
}

/** بسته‌ی کامل وضعیت یک نبرد تورنمنت برای میدان نبرد. */
export async function loadTournamentBattleBundle(
  supabase: SB,
  battleId: string,
  userId: string
): Promise<TournamentBattleState | null> {
  const { data: battle } = await supabase
    .from("tournament_battles")
    .select("*")
    .eq("id", battleId)
    .maybeSingle();
  if (!battle) return null;
  const b = battle as TournamentBattle;

  const oppId = b.host_id === userId ? b.guest_id : b.host_id;
  const [qR, tR, subR, profR] = await Promise.all([
    supabase.from("battle_questions").select("*").eq("id", b.battle_question_id).maybeSingle(),
    supabase.from("tournaments").select("*").eq("id", b.tournament_id).maybeSingle(),
    supabase.from("tournament_battle_submissions").select("*").eq("battle_id", b.id),
    supabase
      .from("user_profiles")
      .select("user_id, display_name, avatar")
      .in("user_id", [userId, oppId].filter(Boolean)),
  ]);

  const subs = (subR.data ?? []) as {
    user_id: string;
    passed_tests: number;
    total_tests: number;
    is_final: boolean;
    submitted_at: string;
  }[];
  const profs = new Map(
    ((profR.data ?? []) as { user_id: string; display_name: string; avatar: string }[]).map((p) => [p.user_id, p])
  );
  const subOf = (id: string) => subs.find((s) => s.user_id === id);

  const mk = (id: string, isMe: boolean): BattlePlayer => {
    const s = subOf(id);
    const p = profs.get(id);
    return {
      id,
      name: isMe ? p?.display_name || "شما" : p?.display_name || "حریف",
      avatar: p?.avatar || (isMe ? "👤" : "❓"),
      ready: true,
      passed: s?.passed_tests ?? 0,
      total: s?.total_tests ?? 0,
      isFinal: !!s?.is_final,
      connected: true, // نبرد تورنمنت پینگ ندارد؛ وضعیت از خود نبرد گرفته می‌شود
    };
  };

  const now = Date.now();
  const started = b.started_at ? new Date(b.started_at).getTime() : now;
  const remainingMs = Math.max(0, b.time_limit * 1000 - Math.max(0, now - started - COUNTDOWN_MS));
  const countdownMs = b.status === "active" ? Math.max(0, started + COUNTDOWN_MS - now) : 0;
  const outcome =
    b.status === "finished"
      ? b.winner_id === null
        ? "draw"
        : b.winner_id === userId
          ? "win"
          : "lose"
      : null;

  return {
    battle: b,
    question: (qR.data as BattleQuestion | null) ?? null,
    tournament: (tR.data as Tournament | null) ?? null,
    me: mk(userId, true),
    opponent: oppId ? mk(oppId, false) : null,
    remainingMs,
    countdownMs,
    outcome,
  };
}
