export const AVATAR_PALETTE = [
  "👦", "👨", "🧑", "👴", "👱", "🧔", "👨‍🦰", "👨‍🦱", "👨‍🦳", "👨‍🦲",
  "👧", "👩", "👵", "👱‍♀️", "👩‍🦰", "👩‍🦱", "👩‍🦳", "👩‍🦲", "🧓", "👶",
  "🧑‍🎓", "👨‍🎓", "👩‍🎓", "🧑‍🏫", "👨‍🏫", "👩‍🏫",
  "🧑‍💻", "👨‍💻", "👩‍💻", "🧑‍🔬", "👨‍🔬", "👩‍🔬",
  "🧑‍🚀", "🧑‍🎤", "🧑‍🎨", "🧑‍🍳", "👮", "👷", "💂", "🕵️",
  "🧙", "🧙‍♀️", "🧚", "🧚‍♀️", "🧜", "🧜‍♀️", "🦸", "🦸‍♀️", "🦹", "🦹‍♀️",
  "😀", "😎", "🤓", "🤠", "🥳", "😺", "👽", "🤖", "👻", "💀",
  "🦊", "🐼", "🐨", "🐯", "🦁", "🐸", "🐙", "🦄", "🐲", "🐧", "🦉", "🐢", "🐳", "🦋", "🐝",
  "🚀", "⭐", "🎯", "🎨", "🎸", "⚡", "🔥", "🌊", "🌈", "🍀", "💎", "🎮", "👾", "🎭", "🎩", "🧩", "🔮", "🎲",
];

export const PALETTE = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f59e0b",
  "#10b981", "#06b6d4", "#3b82f6", "#84cc16", "#eab308",
];

export function colorOf(name?: string | null): string {
  let h = 0;
  const s = name || "ناشناس";
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function initials(name?: string | null): string {
  const s = (name || "؟").trim();
  const p = s.split(/\s+/);
  if (p.length === 1) return p[0].slice(0, 1).toUpperCase();
  return (p[0][0] + p[1][0]).toUpperCase();
}

export function fmtRelative(iso?: string | null): string {
  if (!iso) return "—";
  const d = Date.now() - new Date(iso).getTime();
  const s = Math.floor(d / 1000);
  if (s < 60) return "همین حالا";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} دقیقه پیش`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ساعت پیش`;
  const dd = Math.floor(h / 24);
  if (dd < 30) return `${dd} روز پیش`;
  return new Date(iso).toLocaleDateString("fa-IR");
}

export async function hashPin(pin: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest(
    "SHA-256",
    enc.encode(pin + "::pythonclass::v1")
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateSessionCode(): string {
  const c = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += c[Math.floor(Math.random() * c.length)];
  return code;
}

export function randomAvatar(exclude?: string): string {
  let pick = exclude;
  let safety = 0;
  while (pick === exclude && safety < 20) {
    pick = AVATAR_PALETTE[Math.floor(Math.random() * AVATAR_PALETTE.length)];
    safety++;
  }
  return pick as string;
}
