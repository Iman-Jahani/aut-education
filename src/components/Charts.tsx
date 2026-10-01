"use client";

// Tiny dependency-free charts (plain divs + SVG) so the student dashboard and
// the teacher panel can show activity without pulling in a chart library.
// Every chart takes `dark` because /admin keeps its original dark look while
// the rest of the app is light.
import { faNum } from "@/lib/auth";

const TONES: Record<string, { light: string; dark: string; solid: string }> = {
  primary: { light: "from-indigo-500 to-violet-500", dark: "from-indigo-400 to-violet-400", solid: "#6366f1" },
  emerald: { light: "from-emerald-500 to-teal-500", dark: "from-emerald-400 to-teal-400", solid: "#10b981" },
  amber: { light: "from-amber-400 to-orange-500", dark: "from-amber-300 to-orange-400", solid: "#f59e0b" },
  rose: { light: "from-rose-500 to-pink-500", dark: "from-rose-400 to-pink-400", solid: "#f43f5e" },
};

export type Tone = keyof typeof TONES;

const pct = (value: number, max: number) =>
  max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));

/** Counts per day for the last `days` days (oldest → newest). */
export function dailyCounts(dates: string[], days = 7): { values: number[]; labels: string[] } {
  const values: number[] = [];
  const labels: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toDateString();
    values.push(dates.filter((x) => new Date(x).toDateString() === key).length);
    labels.push(d.toLocaleDateString("fa-IR", { day: "numeric" }));
  }
  return { values, labels };
}

/** Horizontal progress bar with an optional label and value. */
export function ProgressBar({
  value,
  max,
  dark = false,
  tone = "primary",
  label,
  suffix = "",
  showValue = true,
}: {
  value: number;
  max: number;
  dark?: boolean;
  tone?: Tone;
  label?: string;
  suffix?: string;
  showValue?: boolean;
}) {
  const t = TONES[tone] || TONES.primary;
  return (
    <div className="w-full">
      {(label || showValue) && (
        <div className={`flex items-center justify-between text-[11px] mb-1 ${dark ? "text-slate-400" : "text-muted"}`}>
          <span className="truncate">{label}</span>
          {showValue && (
            <span className={`font-bold ${dark ? "text-slate-200" : "text-ink"}`}>
              {faNum(value)}
              {suffix}
            </span>
          )}
        </div>
      )}
      <div className={`h-2 rounded-full overflow-hidden ${dark ? "bg-slate-700/70" : "bg-slate-100"}`}>
        <div
          className={`h-full rounded-full bg-gradient-to-r transition-[width] duration-500 ${dark ? t.dark : t.light}`}
          style={{ width: `${pct(value, max)}%` }}
        />
      </div>
    </div>
  );
}

/** Vertical bars with a value on top and a label underneath. */
export function BarsChart({
  items,
  dark = false,
  height = 140,
  suffix = "",
  tone = "primary",
  emptyText = "داده‌ای نیست",
}: {
  items: { label: string; value: number; hint?: string }[];
  dark?: boolean;
  height?: number;
  suffix?: string;
  tone?: Tone;
  emptyText?: string;
}) {
  const t = TONES[tone] || TONES.primary;
  const max = items.reduce((n, i) => Math.max(n, i.value), 0);
  if (!items.length) {
    return <div className={`text-xs py-6 text-center ${dark ? "text-slate-500" : "text-muted"}`}>{emptyText}</div>;
  }
  return (
    <div className="flex items-end gap-2 sm:gap-3 w-full" style={{ height }}>
      {items.map((it) => (
        <div key={it.label} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full gap-1">
          <span className={`text-[11px] font-bold ${dark ? "text-slate-300" : "text-ink"}`}>
            {faNum(it.value)}
            {suffix}
          </span>
          <div
            className={`w-full rounded-t-lg bg-gradient-to-t ${dark ? t.dark : t.light}`}
            style={{ height: `${Math.max(max ? pct(it.value, max) : 0, it.value > 0 ? 6 : 2)}%` }}
            title={it.hint || `${it.label}: ${faNum(it.value)}`}
          />
          <span className={`text-[10px] truncate w-full text-center ${dark ? "text-slate-500" : "text-muted"}`}>
            {it.label}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Compact bars for "activity per day" style series. */
export function MiniBars({
  values,
  labels,
  dark = false,
  suffix = "",
}: {
  values: number[];
  labels?: string[];
  dark?: boolean;
  suffix?: string;
}) {
  const max = values.reduce((n, v) => Math.max(n, v), 0);
  return (
    <div className="flex items-end gap-1.5 w-full h-16">
      {values.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
          <div
            className={`w-full rounded-md ${
              v > 0
                ? "bg-gradient-to-t from-indigo-500 to-violet-400"
                : dark
                ? "bg-slate-700/60"
                : "bg-slate-100"
            }`}
            style={{ height: `${max ? Math.max(pct(v, max), v > 0 ? 12 : 4) : 4}%` }}
            title={`${labels?.[i] ?? i}: ${faNum(v)}${suffix}`}
          />
          {labels?.[i] && <span className={`text-[9px] ${dark ? "text-slate-500" : "text-muted"}`}>{labels[i]}</span>}
        </div>
      ))}
    </div>
  );
}

/** SVG donut used for scores / progress percentages. */
export function ProgressRing({
  value,
  max = 100,
  size = 96,
  dark = false,
  caption,
  tone = "primary",
}: {
  value: number;
  max?: number;
  size?: number;
  dark?: boolean;
  caption?: string;
  tone?: Tone;
}) {
  const t = TONES[tone] || TONES.primary;
  const p = pct(value, max);
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="inline-flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={dark ? "stroke-slate-700" : "stroke-slate-200"} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke={t.solid}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (p / 100) * c}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          className={`font-extrabold ${dark ? "fill-slate-100" : "fill-slate-800"}`}
          style={{ fontSize: size / 4 }}
        >
          {faNum(Math.round(p))}٪
        </text>
      </svg>
      {caption && <span className={`text-[11px] mt-1 ${dark ? "text-slate-400" : "text-muted"}`}>{caption}</span>}
    </div>
  );
}
