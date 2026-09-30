"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { fmtRelative } from "@/lib/utils";
import type { Comment } from "@/lib/types";
import { CommentsSkeleton } from "@/components/Skeleton";

export default function CommentsPanel({
  cellId,
  onCountChange,
}: {
  cellId: string;
  onCountChange?: (count: number) => void;
}) {
  const { user, displayName } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("comments")
      .select("*")
      .eq("cell_id", cellId)
      .order("created_at", { ascending: true });
    setComments(data || []);
    onCountChange?.(data?.length || 0);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellId]);

  const submit = async () => {
    const t = text.trim();
    if (!t || !user) return;
    setSending(true);
    const { error } = await supabase
      .from("comments")
      .insert({ cell_id: cellId, author_id: user.id, author_name: displayName, text: t });
    setSending(false);
    if (!error) {
      setText("");
      load();
    }
  };

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="space-y-2.5 max-h-52 overflow-y-auto mb-3">
        {loading ? (
          <CommentsSkeleton />
        ) : comments.length === 0 ? (
          <div className="text-xs text-muted">هنوز کامنتی نیست.</div>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="bg-slate-50 rounded-lg px-3 py-2 text-sm">
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-bold text-xs">{c.author_name || "ناشناس"}</span>
                <span className="text-[11px] text-muted">{fmtRelative(c.created_at)}</span>
              </div>
              <div className="text-ink/90 whitespace-pre-wrap">{c.text}</div>
            </div>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submit();
          }}
          placeholder="نظر خود را اینجا بنویسید... (Ctrl+Enter برای ارسال)"
          rows={2}
          className="flex-1 border border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-primary resize-none"
        />
        <button
          onClick={submit}
          disabled={sending || !text.trim()}
          className="px-4 rounded-lg text-xs font-bold text-white bg-gradient-to-br from-primary to-primary2 disabled:opacity-40"
        >
          ارسال
        </button>
      </div>
    </div>
  );
}
