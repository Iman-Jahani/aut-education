"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ToastProvider";
import { colorOf } from "@/lib/utils";
import { ChatSkeleton } from "@/components/Skeleton";
import Icon from "@/components/Icon";
import type { TeamMessage } from "@/lib/types";
import type { CurrentTeam } from "@/components/TeamPicker";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
}

export default function TeamChat({ classId, team }: { classId: string; team: CurrentTeam }) {
  const { user, displayName, avatar } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const seenKey = `chatSeen_${team.id}`;

  const markSeen = useCallback(() => {
    localStorage.setItem(seenKey, new Date().toISOString());
    setUnread(0);
  }, [seenKey]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("team_messages")
      .select("*")
      .eq("team_id", team.id)
      .order("created_at", { ascending: true })
      .limit(300);
    const list = (data || []) as TeamMessage[];
    setMessages(list);
    setLoaded(true);
    if (!openRef.current) {
      const seen = localStorage.getItem(seenKey) || "1970-01-01T00:00:00Z";
      setUnread(list.filter((m) => m.created_at > seen && m.user_id !== user?.id).length);
    }
  }, [team.id, seenKey, user?.id]);

  useEffect(() => {
    setMessages([]);
    setLoaded(false);
    load();
    const channel = supabase
      .channel("team-chat-" + team.id)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "team_messages", filter: `team_id=eq.${team.id}` },
        () => load()
      )
      .subscribe();
    const poll = setInterval(load, 10000); // fallback if Realtime isn't enabled on the table
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [team.id, load]);

  useEffect(() => {
    if (open) {
      markSeen();
      setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }), 30);
    }
  }, [open, messages.length, markSeen]);

  const send = async () => {
    const t = text.trim();
    if (!t || !user || sending) return;
    if (t.length > 1000) return toast("پیام خیلی بلنده (حداکثر ۱۰۰۰ کاراکتر)", "err");
    setSending(true);
    const { error } = await supabase
      .from("team_messages")
      .insert({ team_id: team.id, class_id: classId, user_id: user.id, author_name: displayName, avatar, text: t });
    setSending(false);
    if (error) return toast("ارسال نشد: " + error.message, "err");
    setText("");
    load();
  };

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-4 right-4 z-[85] w-14 h-14 rounded-full text-white text-2xl shadow-glow grid place-items-center hover:scale-105 transition"
        style={{ background: `linear-gradient(135deg, ${team.color}, ${team.color}cc)` }}
        aria-label="چت تیم"
      >
        <Icon name="message" className="w-6 h-6" />
        {unread > 0 && (
          <span className="absolute -top-1 -left-1 min-w-[22px] h-[22px] px-1 grid place-items-center rounded-full bg-danger text-white text-[11px] font-bold ring-2 ring-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed bottom-20 right-4 z-[85] w-[min(380px,calc(100vw-2rem))] h-[min(520px,70vh)] bg-white rounded-2xl shadow-2xl anim-pop border border-line flex flex-col overflow-hidden anim-pop">
          <div className="px-4 py-3 text-white flex items-center gap-2.5" style={{ background: team.color }}>
            <Icon name="message" className="w-5 h-5" />
            <div className="min-w-0 flex-1">
              <div className="font-extrabold text-sm truncate">چت تیم {team.name}</div>
              <div className="text-[11px] opacity-85">فقط اعضای تیم می‌بینن</div>
            </div>
            <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-full hover:bg-white/20 grid place-items-center">
              <Icon name="x" className="w-4 h-4" />
            </button>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-1 bg-slate-50">
            {!loaded ? (
              <ChatSkeleton />
            ) : messages.length === 0 ? (
              <div className="h-full grid place-items-center text-center text-sm text-muted">
                <div>
                  <div className="mb-2 flex justify-center text-primary">
                    <Icon name="sparkles" className="w-8 h-8" />
                  </div>
                  اولین پیام رو بفرست!
                </div>
              </div>
            ) : (
              messages.map((m, i) => {
                const mine = m.user_id === user?.id;
                const prev = messages[i - 1];
                const first = !prev || prev.user_id !== m.user_id;
                return (
                  <div key={m.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""} ${first ? "mt-3" : ""}`}>
                    <div className="w-8 shrink-0">
                      {first && (
                        <div
                          className="w-8 h-8 rounded-full grid place-items-center text-base bg-white border"
                          style={{ borderColor: colorOf(m.author_name) }}
                        >
                          {m.avatar || "🙂"}
                        </div>
                      )}
                    </div>
                    <div className={`max-w-[78%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                      {first && !mine && <div className="text-[11px] font-bold text-muted mb-0.5 px-1">{m.author_name}</div>}
                      <div
                        className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                          mine ? "text-white rounded-tr-md" : "bg-white border border-line rounded-tl-md"
                        }`}
                        style={mine ? { background: team.color } : undefined}
                      >
                        {m.text}
                      </div>
                      <div className="text-[10px] text-muted mt-0.5 px-1">{fmtTime(m.created_at)}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="p-2.5 border-t border-line bg-white flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder="پیام برای تیم…"
              className="flex-1 resize-none max-h-24 border border-line rounded-xl px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={send}
              disabled={sending || !text.trim()}
              className="w-10 h-10 rounded-xl text-white grid place-items-center disabled:opacity-40 shrink-0"
              style={{ background: team.color }}
              aria-label="ارسال"
            >
              <Icon name="send" className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
