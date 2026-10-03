// The classes a user has joined, remembered per device (localStorage).
//
// Why localStorage: there is no membership table in the schema, and the class
// row itself is protected by RLS. Remembering {id, code, title} locally lets
// the student dashboard list "my classes", show a resume shortcut and still
// open each class through the `join_class_by_code` RPC.
import type { ClassSession } from "@/lib/types";

export interface JoinedClass {
  id: string;
  code: string;
  title: string;
  teacher_id?: string | null;
  joinedAt: string;
}

const KEY = "joinedClasses";
const MAX = 30;

function readAll(): JoinedClass[] {
  if (typeof window === "undefined") return [];
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((c): c is JoinedClass => {
      const o = c as Partial<JoinedClass>;
      return !!o && typeof o.id === "string" && typeof o.code === "string";
    });
  } catch {
    return [];
  }
}

function writeAll(list: JoinedClass[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* storage disabled/full — the dashboard simply shows nothing */
  }
}

/** Classes, newest join first. */
export function listJoinedClasses(): JoinedClass[] {
  return readAll().sort((a, b) => (a.joinedAt < b.joinedAt ? 1 : -1));
}

/**
 * Adds/refreshes a class and returns the new list. Also keeps
 * `lastSessionCode` (used by the "resume" shortcuts) in sync.
 */
export function rememberClass(
  cls: Pick<ClassSession, "id" | "code" | "title"> & { teacher_id?: string | null }
): JoinedClass[] {
  const entry: JoinedClass = {
    id: cls.id,
    code: cls.code,
    title: cls.title || cls.code,
    teacher_id: cls.teacher_id ?? null,
    joinedAt: new Date().toISOString(),
  };
  const next = [entry, ...readAll().filter((c) => c.id !== entry.id)].slice(0, MAX);
  writeAll(next);
  try {
    if (typeof window !== "undefined") localStorage.setItem("lastSessionCode", entry.code);
  } catch {
    /* ignore */
  }
  return next;
}

/** Removes one class (used by the "remove from my list" button). */
export function forgetClass(id: string): JoinedClass[] {
  const next = readAll().filter((c) => c.id !== id);
  writeAll(next);
  return next;
}

// ---------------------------------------------------------------------------
// Which lesson (جلسه) the user was last in, per class — device-local.
// Powers the "ادامه‌ی جلسه‌ی قبل" shortcut and the resume hint on the class
// page, so a student immediately sees where they left off.
// ---------------------------------------------------------------------------

const lessonKey = (classId: string) => `lastLesson_${classId}`;

export function setLastLesson(classId: string, lessonId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(lessonKey(classId), lessonId);
  } catch {
    /* storage disabled — the shortcut is simply not shown */
  }
}

export function getLastLesson(classId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(lessonKey(classId));
  } catch {
    return null;
  }
}
