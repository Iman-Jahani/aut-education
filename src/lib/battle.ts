// ⚔️ 1v1 Code Battle — shared client helpers (types live in @/lib/types).
// All server state goes through /api/battle/* (JSON fetch + 2s polling);
// the student's own code always runs locally in the browser with Pyodide.
import { faNum } from "@/lib/auth";
import type { Battle, BattleStateResponse, BattleStats } from "@/lib/types";

/** Battle lengths offered to the room host (seconds). */
export const BATTLE_TIME_OPTIONS = [
  { seconds: 180, label: "۳ دقیقه" },
  { seconds: 300, label: "۵ دقیقه" },
  { seconds: 600, label: "۱۰ دقیقه" },
];

export const MAX_BATTLES_PER_DAY = 10;
export const WALKOVER_AFTER_MS = 60_000;

/** "m:ss" with Persian digits, never negative. */
export function battleClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${faNum(m)}:${faNum(String(s).padStart(2, "0"))}`;
}

export type ApiResult<T> = { ok: boolean; status: number; data: (T & { error?: string; detail?: string }) | null };

/** Thin JSON wrapper around /api/battle/*. */
export async function battleApi<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = (await res.json().catch(() => null)) as ApiResult<T>["data"];
  return { ok: res.ok, status: res.status, data };
}

export async function postBattle<T = { battle: Battle }>(body: Record<string, unknown>): Promise<ApiResult<T>> {
  return battleApi<T>("/api/battle", { method: "POST", body: JSON.stringify(body) });
}

export async function battleState(id: string): Promise<ApiResult<BattleStateResponse>> {
  return battleApi<BattleStateResponse>(`/api/battle/${id}/state`);
}

export async function battleAction<T = { battle: Battle }>(
  id: string,
  body: Record<string, unknown>
): Promise<ApiResult<T>> {
  return battleApi<T>(`/api/battle/${id}/action`, { method: "POST", body: JSON.stringify(body) });
}

/** Short WebAudio beep for the 3-2-1 countdown (no audio asset needed). */
export function battleBeep(freq = 660, ms = 160): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ms / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + ms / 1000 + 0.05);
    osc.onended = () => {
      void ctx.close().catch(() => undefined);
    };
  } catch {
    /* audio unavailable — countdown still shows */
  }
}

export type BattleStatsResult = { battle: Battle | null; stats: BattleStats };

export async function battleHome(): Promise<ApiResult<BattleStatsResult>> {
  return battleApi<BattleStatsResult>("/api/battle");
}
