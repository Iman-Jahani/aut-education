"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

interface TimedItem {
  id: string;
  status: string;
  time_limit: number;
  started_at?: string | null;
}

// Tracks the single "active" row (quiz / competition) of a class:
// loads it, subscribes to realtime changes, keeps a live countdown, and
// reports whether the current user (or their team) already answered.
export function useActiveItem<T extends TimedItem>(
  table: "quizzes" | "competitions",
  classId: string | undefined,
  enabled: boolean,
  checkAnswered: (item: T) => Promise<boolean>,
  answeredDeps: unknown[] = [],
  countDrafts = false
) {
  const [item, setItem] = useState<T | null>(null);
  const [answered, setAnswered] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [draftCount, setDraftCount] = useState(0);
  const checkRef = useRef(checkAnswered);
  checkRef.current = checkAnswered;

  const reload = useCallback(async () => {
    if (!classId || !enabled) return;
    const { data } = await supabase
      .from(table)
      .select("*")
      .eq("class_id", classId)
      .eq("status", "active")
      .maybeSingle();
    const row = (data as T) || null;
    setItem(row);
    setAnswered(row ? await checkRef.current(row) : false);
    if (countDrafts) {
      const { count } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("class_id", classId)
        .eq("status", "draft");
      setDraftCount(count || 0);
    } else {
      setDraftCount(0);
    }
  }, [table, classId, enabled, countDrafts]);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, ...answeredDeps]);

  useEffect(() => {
    if (!classId) return;
    const channel = supabase
      .channel(`${table}-${classId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `class_id=eq.${classId}` },
        () => reload()
      )
      .subscribe();
    // Light polling fallback in case Realtime isn't enabled for the table.
    const poll = setInterval(reload, 5000);
    const onVisible = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", reload);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", reload);
    };
  }, [table, classId, reload]);

  useEffect(() => {
    if (!item) {
      setRemaining(0);
      return;
    }
    const tick = () => {
      const elapsed = Math.floor((Date.now() - new Date(item.started_at || Date.now()).getTime()) / 1000);
      const rem = Math.max(0, item.time_limit * 60 - elapsed);
      setRemaining(rem);
      if (rem <= 0) reload();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [item, reload]);

  return { item, answered, remaining, draftCount, reload };
}
