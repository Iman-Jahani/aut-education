// Small helpers around the `lessons` table (see supabase/LESSONS.sql).
//
// Every function degrades gracefully when the LESSONS.sql migration has not
// been run yet: the query error is swallowed and `listLessons` returns `null`
// so the class page can fall back to its old single-workspace behaviour
// instead of breaking.

import { supabase } from "@/lib/supabase";
import type { Lesson } from "@/lib/types";

/** Same gap idea as cells: a new lesson is placed after the last one. */
const POSITION_STEP = 1000;

/**
 * Lessons of a class, in display order.
 * Returns `null` when the `lessons` table is missing (migration not run yet).
 */
export async function listLessons(classId: string): Promise<Lesson[] | null> {
  const { data, error } = await supabase
    .from("lessons")
    .select("*")
    .eq("class_id", classId)
    .order("position", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) return null;
  return (data as Lesson[] | null) ?? [];
}

/**
 * Creates a lesson at the end of the class's list.
 * Throws a Persian error when the insert fails (e.g. the migration is missing).
 */
export async function createLesson(classId: string, title: string): Promise<Lesson> {
  const existing = await listLessons(classId);
  const last = existing && existing.length ? existing[existing.length - 1] : null;
  const position = last?.position ? last.position + POSITION_STEP : Date.now();

  const { data, error } = await supabase
    .from("lessons")
    .insert({ class_id: classId, title: title.trim() || "جلسه", position })
    .select()
    .single();
  if (error || !data) throw new Error(error?.message || "ساخت جلسه ناموفق بود");
  return data as Lesson;
}

/** Renames (and optionally publishes/unpublishes) a lesson. */
export async function updateLesson(
  id: string,
  patch: Partial<Pick<Lesson, "title" | "description" | "is_published" | "position">>
): Promise<void> {
  const { error } = await supabase
    .from("lessons")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Deletes a lesson; its cells are removed too (on delete cascade). */
export async function deleteLesson(id: string): Promise<void> {
  const { error } = await supabase.from("lessons").delete().eq("id", id);
  if (error) throw new Error(error.message);
}