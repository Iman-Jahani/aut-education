"use client";

import type { ReactNode } from "react";

export default function LiveBanner({
  icon,
  title,
  remaining,
  status,
  offset = 0,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  remaining: number;
  status: string;
  offset?: number;
  onClick: () => void;
}) {
  const urgent = remaining <= 30;
  const m = Math.floor(remaining / 60).toString().padStart(2, "0");
  const s = (remaining % 60).toString().padStart(2, "0");
  return (
    <button
      onClick={onClick}
      style={{ bottom: 16 + offset }}
      className={`fixed left-1/2 -translate-x-1/2 z-[90] flex items-center gap-3 pl-5 pr-4 py-2.5 rounded-full shadow-glow text-white text-sm font-bold anim-slide-up max-w-[92vw] ${
        urgent ? "bg-gradient-to-l from-red-500 to-rose-600 animate-pulse" : "bg-gradient-to-l from-primary to-primary2"
      }`}
    >
      <span className="w-8 h-8 rounded-full bg-white/20 grid place-items-center text-base shrink-0">{icon}</span>
      <span className="truncate">{title}</span>
      <span className="font-mono bg-black/20 rounded-full px-2.5 py-0.5 text-[13px] shrink-0">
        {m}:{s}
      </span>
      <span className="text-xs opacity-90 hidden sm:inline shrink-0">{status}</span>
    </button>
  );
}
