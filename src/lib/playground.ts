// Personal notebooks for the playground (code without joining a class).
// Backed by supabase/PLAYGROUND.sql: user_notebooks + user_notebook_cells.
//
// Everything here is scoped to the signed-in user id; RLS enforces the same
// rule server-side, so a wrong id can never leak another user's notebook.
import { supabase } from "@/lib/supabase";
import type { Notebook, NotebookCell } from "@/lib/types";

const POSITION_STEP = 1000;

/** A friendly starter snippet so the playground never opens completely empty. */
export const WELCOME_CODE = `# 🧪 فضای تمرین آزاد
# این‌جا بدون عضویت در هیچ کلاسی می‌تونی پایتون بنویسی و اجرا کنی.
# سلول‌هات خودکار ذخیره می‌شن. Ctrl+Enter = اجرا

name = "دنیا"
print(f"سلام {name}!")

for i in range(3):
    print(i, i * i)
`;

/** The user's notebooks, in display order. */
export async function listNotebooks(userId: string): Promise<Notebook[]> {
  const { data, error } = await supabase
    .from("user_notebooks")
    .select("*")
    .eq("user_id", userId)
    .order("position", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as Notebook[] | null) ?? [];
}

export async function createNotebook(userId: string, title: string): Promise<Notebook> {
  const { data, error } = await supabase
    .from("user_notebooks")
    .insert({ user_id: userId, title: title.trim() || "دفترچه من", position: Date.now() })
    .select()
    .single();
  if (error || !data) throw new Error(error?.message || "ساخت دفترچه ناموفق بود");
  return data as Notebook;
}

export async function renameNotebook(id: string, title: string): Promise<void> {
  const { error } = await supabase
    .from("user_notebooks")
    .update({ title: title.trim() || "دفترچه من", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteNotebook(id: string): Promise<void> {
  const { error } = await supabase.from("user_notebooks").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Cells of one notebook, in display order. */
export async function listNotebookCells(notebookId: string): Promise<NotebookCell[]> {
  const { data, error } = await supabase
    .from("user_notebook_cells")
    .select("*")
    .eq("notebook_id", notebookId)
    .order("position", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as NotebookCell[] | null) ?? [];
}

export async function addNotebookCell(
  userId: string,
  notebookId: string,
  position: number,
  patch: { code?: string } = {}
): Promise<NotebookCell> {
  const { data, error } = await supabase
    .from("user_notebook_cells")
    .insert({
      notebook_id: notebookId,
      user_id: userId,
      code: patch.code ?? "",
      output: "",
      tags: [],
      position,
    })
    .select()
    .single();
  if (error || !data) throw new Error(error?.message || "افزودن سلول ناموفق بود");
  return data as NotebookCell;
}

/** Next free position at the end of a notebook's cells. */
export function nextPosition(cells: { position: number | null }[]): number {
  if (!cells.length) return Date.now();
  const max = Math.max(...cells.map((c) => c.position ?? 0));
  return Math.max(Date.now(), max + 1);
}

/**
 * Creates a fresh notebook with one welcome cell.
 * Used for the very first visit (and by the "دفترچه جدید" button).
 */
export async function seedNotebook(userId: string, title = "دفترچه من"): Promise<Notebook> {
  const nb = await createNotebook(userId, title);
  const { data, error } = await supabase
    .from("user_notebook_cells")
    .insert({
      notebook_id: nb.id,
      user_id: userId,
      code: WELCOME_CODE,
      output: "",
      tags: [],
      position: Date.now(),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  void data;
  return nb;
}

export { POSITION_STEP };