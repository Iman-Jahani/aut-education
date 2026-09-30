"use client";

import { createContext, useCallback, useContext, useState } from "react";
import Icon, { type IconName } from "@/components/Icon";

type ToastType = "ok" | "err" | "info";
interface ToastItem {
  id: number;
  msg: string;
  type: ToastType;
}

const ToastContext = createContext<((msg: string, type?: ToastType) => void) | null>(
  null
);

const ICONS: Record<ToastType, IconName> = { ok: "check", err: "x", info: "info" };
const COLORS: Record<ToastType, string> = {
  ok: "bg-emerald-600",
  err: "bg-red-600",
  info: "bg-slate-700",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((msg: string, type: ToastType = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3200);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 items-center">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`${COLORS[t.type]} text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-sm font-semibold anim-pop`}
          >
            <span className="grid place-items-center shrink-0">
              <Icon name={ICONS[t.type]} className="w-4 h-4" strokeWidth={2.5} />
            </span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
