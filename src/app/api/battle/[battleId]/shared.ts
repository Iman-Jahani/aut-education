// Shared server-side battle logic (used by state + action routes).
import type { Battle, BattlePlayer, BattleStateResponse } from "@/lib/types";

export const WALKOVER_AFTER_MS = 60_000; // حریف ۶۰ ثانیه برنگردد → واک‌اور
export const COUNTDOWN_MS = 3000; // شمارش ۳-۲-۱ قبل از شروع تایمر

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

export function isParticipant(battle: Battle, userId: string): boolean {
  return battle.host_id === userId || battle.guest_id === userId;
}

function connected(ping: string | null): boolean {
  if (!ping) return false;
  return Date.now() - new Date(ping).getTime() < WALKOVER_AFTER_MS;
}

/**
 * Only submissions from the CURRENT round count. Needed because a rematch can
 * not clear the opponent's row (RLS lets you write your own row only), so stale
 * scores from the previous round are ignored instead.
 */
function subsForRound<T extends { submitted_at: string }>(battle: Battle, subs: T[]): T[] {
  if (!battle.started_at) return subs;
  const started = new Date(battle.started_at).getTime();
  return subs.filter((s) => !s.submitted_at || new Date(s.submitted_at).getTime() >= started - 1000);
}

/** Finishes an active battle on timeout or walkover. Returns the (maybe) updated row. */
export async function finalizeBattle(supabase: SB, battle: Battle, actorId: string): Promise<Battle> {
  if (battle.status !== "active" || !battle.started_at || !battle.guest_id) return battle;
  const now = Date.now();
  const started = new Date(battle.started_at).getTime();
  const timedOut = now - started - COUNTDOWN_MS >= battle.time_limit * 1000;

  const actorIsHost = battle.host_id === actorId;
  const oppPing = actorIsHost ? battle.guest_last_ping : battle.host_last_ping;
  const oppSilentMs = oppPing ? now - new Date(oppPing).getTime() : now - started;
  const walkover = oppSilentMs > WALKOVER_AFTER_MS && now - started > WALKOVER_AFTER_MS;

  if (!timedOut && !walkover) return battle;

  let winner: string | null = null;
  if (walkover && !timedOut) {
    winner = actorId;
  } else {
    const { data } = await supabase.from("battle_submissions").select("*").eq("battle_id", battle.id);
    const subs = subsForRound(battle, (data ?? []) as { user_id: string; passed_tests: number; submitted_at: string }[]);
    const byUser = new Map(subs.map((s) => [s.user_id, s]));
    const h = byUser.get(battle.host_id);
    const g = battle.guest_id ? byUser.get(battle.guest_id) : undefined;
    const hp = h?.passed_tests ?? 0;
    const gp = g?.passed_tests ?? 0;
    if (h || g) {
      if (hp === gp) {
        const ht = h?.submitted_at ? new Date(h.submitted_at).getTime() : Number.POSITIVE_INFINITY;
        const gt = g?.submitted_at ? new Date(g.submitted_at).getTime() : Number.POSITIVE_INFINITY;
        winner = ht === Number.POSITIVE_INFINITY && gt === Number.POSITIVE_INFINITY
          ? null
          : ht <= gt
            ? battle.host_id
            : battle.guest_id;
      } else {
        winner = hp > gp ? battle.host_id : battle.guest_id;
      }
    }
  }

  const upd = await supabase
    .from("battles")
    .update({ status: "finished", winner_id: winner, finished_at: new Date().toISOString() })
    .eq("id", battle.id)
    .eq("status", "active")
    .select()
    .single();
  return (upd.data as Battle) ?? battle;
}

/** Full polling payload: battle + exercise + both players + timer + outcome. */
export async function loadBattleBundle(
  supabase: SB,
  battleId: string,
  userId: string
): Promise<BattleStateResponse | null> {
  const { data: battle } = await supabase.from("battles").select("*").eq("id", battleId).maybeSingle();
  if (!battle) return null;
  const b = battle as Battle;

  const oppId = b.host_id === userId ? b.guest_id : b.host_id;
  const [subR, exR, profR] = await Promise.all([
    supabase.from("battle_submissions").select("*").eq("battle_id", b.id),
    b.exercise_id
      ? supabase.from("exercises").select("id, title, description, hint, test_cases").eq("id", b.exercise_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("user_profiles").select("user_id, display_name, avatar").in("user_id", [userId, oppId].filter(Boolean)),
  ]);

  const subs = subsForRound(
    b,
    (subR.data ?? []) as {
      user_id: string;
      code: string;
      passed_tests: number;
      total_tests: number;
      is_final: boolean;
      submitted_at: string;
    }[]
  );
  const subByUser = new Map(subs.map((s) => [s.user_id, s]));
  const profByUser = new Map(((profR.data ?? []) as { user_id: string; display_name: string; avatar: string }[]).map((p) => [p.user_id, p]));

  const player = (id: string | null, ready: boolean, ping: string | null): BattlePlayer | null => {
    if (!id) return null;
    const sub = subByUser.get(id);
    const prof = profByUser.get(id);
    return {
      id,
      name: prof?.display_name || "بازیکن",
      avatar: prof?.avatar || "👤",
      ready,
      passed: sub?.passed_tests ?? 0,
      total: sub?.total_tests ?? 0,
      isFinal: !!sub?.is_final,
      connected: connected(ping),
    };
  };

  const me: BattlePlayer = player(userId, b.host_id === userId ? b.host_ready : b.guest_ready, null) ?? {
    id: userId, name: "من", avatar: "👤", ready: false, passed: 0, total: 0, isFinal: false, connected: true,
  };
  const meSub = subByUser.get(userId);
  if (meSub) me.passed = meSub.passed_tests;
  const opponent = oppId ? player(oppId, b.host_id === userId ? b.guest_ready : b.host_ready, b.host_id === userId ? b.guest_last_ping : b.host_last_ping) : null;

  const now = Date.now();
  const started = b.started_at ? new Date(b.started_at).getTime() : 0;
  const countdownMs = b.status === "active" && started ? Math.max(0, started + COUNTDOWN_MS - now) : 0;
  const remainingMs =
    b.status === "active" && started
      ? Math.max(0, b.time_limit * 1000 - Math.max(0, now - started - COUNTDOWN_MS))
      : b.time_limit * 1000;

  const outcome =
    b.status === "finished" ? (b.winner_id === null ? "draw" : b.winner_id === userId ? "win" : "lose") : null;

  return {
    battle: b,
    exercise: (exR.data as BattleStateResponse["exercise"]) ?? null,
    me,
    opponent,
    remainingMs,
    countdownMs,
    outcome,
  };
}
