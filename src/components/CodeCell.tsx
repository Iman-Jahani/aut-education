"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { dracula } from "@uiw/codemirror-theme-dracula";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ToastProvider";
import { runPython } from "@/lib/pyodide";
import { colorOf, initials, fmtRelative } from "@/lib/utils";
import CommentsPanel from "@/components/CommentsPanel";
import { Skeleton } from "@/components/Skeleton";
import Icon from "@/components/Icon";
import { noPaste } from "@/lib/editor";
import type { Cell } from "@/lib/types";

// Focus + put the cursor at the end (new cells are empty anyway).
function focusSoon(view: import("@codemirror/view").EditorView) {
  requestAnimationFrame(() => {
    try {
      if (!document.contains(view.dom)) return;
      view.focus();
      view.dispatch({ selection: { anchor: view.state.doc.length } });
    } catch {
      /* the view was replaced — the retry effect below gets the new one */
    }
  });
}


export default function CodeCell({
  cell,
  onDeleted,
  teacherMode = false,
  authorAvatar = null,
  autoFocus = false,
}: {
  cell: Cell;
  onDeleted: (id: string) => void;
  /** Teachers may delete every cell inside their own class. */
  teacherMode?: boolean;
  /** Avatar emoji picked by the author (falls back to initials). */
  authorAvatar?: string | null;
  /** When true the editor grabs focus right after mount (new cell). */
  autoFocus?: boolean;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [code, setCode] = useState(cell.code || "");
  const [output, setOutput] = useState(cell.output || "");
  const [isError, setIsError] = useState(false);
  const [running, setRunning] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  // Inline input(): when the program asks for input we show a field in the output
  // area; the collected answers are replayed on every re-run (see lib/pyRunner.ts).
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const inputsRef = useRef<string[]>([]);
  const seedRef = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(cell.comments_count || 0);
  const [tags, setTags] = useState<string[]>(cell.tags || []);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLocalEdit = useRef(0);
  const editorViewRef = useRef<import("@codemirror/view").EditorView | null>(null);
  const extensions = useMemo(() => [python(), noPaste(() => toast("پیست کردن در سلول‌ها غیرفعاله؛ خودت تایپ کن", "err"))], [toast]);
  // Stable object: a fresh `basicSetup` literal on every render would make
  // CodeMirror reconfigure (and drop focus) on every keystroke/re-render.
  const basicSetup = useMemo(() => ({ lineNumbers: true, autocompletion: true }), []);

  // New cells grab focus immediately so the student can start typing.
  const handleCreateEditor = useCallback(
    (view: import("@codemirror/view").EditorView) => {
      editorViewRef.current = view;
      if (autoFocus) focusSoon(view);
    },
    [autoFocus]
  );

  // Retry-based focus: the editor view may be (re)created after the parent
  // re-renders (realtime reload replaces the cells array) — keep trying until
  // the live view is focusable, so nothing steals the cursor away.
  useEffect(() => {
    if (!autoFocus) return;
    let alive = true;
    let tries = 0;
    const tick = () => {
      if (!alive) return;
      const view = editorViewRef.current;
      if (view && document.contains(view.dom)) {
        focusSoon(view);
        return;
      }
      if (tries++ < 40) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => {
      alive = false;
    };
  }, [autoFocus]);

  const isOwn = cell.author_id === user?.id;
  const isPersonal = !cell.team_name;
  // Own cells are always deletable; in teacher mode every cell of the class is.
  const canDelete = isOwn || teacherMode;

  const save = useCallback(
    async (newCode: string, newOutput: string) => {
      await supabase
        .from("cells")
        .update({ code: newCode, output: newOutput, updated_at: new Date().toISOString() })
        .eq("id", cell.id);
    },
    [cell.id]
  );

  // Pull in teammates' edits (realtime) unless I'm typing right now.
  useEffect(() => {
    if (Date.now() - lastLocalEdit.current < 3000) return;
    if (running || pendingPrompt !== null) return; // don't clobber a run in progress
    if ((cell.code || "") !== code) setCode(cell.code || "");
    if ((cell.output || "") !== output) setOutput(cell.output || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell.code, cell.output, cell.updated_at]);

  const handleChange = (value: string) => {
    lastLocalEdit.current = Date.now();
    setCode(value);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(value, output), 900);
  };

  const execute = async (first: boolean) => {
    setRunning(true);
    setShowSkeleton(first);
    try {
      const r = await runPython(code, inputsRef.current, seedRef.current);
      setOutput(r.output);
      setIsError(r.isError);
      if (r.needInput !== null) {
        setPendingPrompt(r.needInput);
        return; // wait for the user's answer, nothing to save yet
      }
      setPendingPrompt(null);
      await save(code, r.output);
    } finally {
      setRunning(false);
      setShowSkeleton(false);
    }
  };

  const run = async () => {
    inputsRef.current = [];
    seedRef.current = Math.floor(Math.random() * 2147483647);
    setPendingPrompt(null);
    setInputValue("");
    await execute(true);
  };

  const submitInput = async () => {
    if (pendingPrompt === null || running) return;
    inputsRef.current = [...inputsRef.current, inputValue];
    setInputValue("");
    setPendingPrompt(null);
    await execute(false);
  };

  const cancelInput = () => {
    setPendingPrompt(null);
    setInputValue("");
    setOutput((o) => (o ? o + "\n" : "") + "^C  (اجرا متوقف شد)");
    setIsError(true);
  };

  useEffect(() => {
    if (pendingPrompt !== null) {
      inputRef.current?.focus();
      inputRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [pendingPrompt]);

  const manualSave = async () => {
    await save(code, output);
    toast("ذخیره شد", "ok");
  };

  const del = async () => {
    const whom = isOwn ? "این سلول حذف شود؟" : `سلول «${cell.author_name || "ناشناس"}» حذف شود؟`;
    if (!confirm(whom)) return;
    const { error } = await supabase.from("cells").delete().eq("id", cell.id);
    if (error) return toast("خطا: " + error.message, "err");
    toast("حذف شد", "ok");
    onDeleted(cell.id);
  };

  const addTag = async () => {
    const t = window.prompt("نام تگ:");
    if (!t || !t.trim()) return;
    const next = Array.from(new Set([...(cell.tags || []), t.trim()]));
    const { error } = await supabase.from("cells").update({ tags: next }).eq("id", cell.id);
    if (error) toast("خطا: " + error.message, "err");
    else setTags(next);
  };

  const removeTag = async (tag: string) => {
    if (!confirm(`تگ «${tag}» حذف شود؟`)) return;
    const next = (cell.tags || []).filter((t) => t !== tag);
    const { error } = await supabase.from("cells").update({ tags: next }).eq("id", cell.id);
    if (error) toast("خطا: " + error.message, "err");
    else setTags(next);
  };

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    []
  );

  return (
    <div
      className={`bg-white border rounded-2xl overflow-hidden shadow-soft hover:shadow-lift transition-shadow ${
        isOwn ? "border-primary/30" : "border-line"
      }`}
      style={!isPersonal ? { borderTop: `3px solid ${colorOf(cell.team_name)}` } : undefined}
    >
      <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
        <div
          className="w-10 h-10 rounded-xl grid place-items-center text-lg shrink-0 border border-line bg-white"
          style={{ background: colorOf(cell.author_name) + "22" }}
          title={cell.author_name || "ناشناس"}
        >
          {authorAvatar || initials(cell.author_name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm truncate">
            {cell.author_name || "ناشناس"}
            {isOwn && (
              <span className="mr-1.5 text-[10px] font-bold px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                شما
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted">{fmtRelative(cell.created_at)}</div>
        </div>
        <span
          className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 inline-flex items-center gap-1 ${
            isPersonal ? "bg-slate-100 text-slate-600" : "text-white"
          }`}
          style={!isPersonal ? { background: colorOf(cell.team_name) } : undefined}
        >
          {isPersonal && <Icon name="file" className="w-3 h-3" />} {isPersonal ? "شخصی" : cell.team_name}
        </span>
        <button
          onClick={() => setShowComments((s) => !s)}
          className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 inline-flex items-center gap-1 ${
            commentCount > 0 ? "bg-primary/10 text-primary" : "bg-slate-100 text-muted"
          }`}
        >
          <Icon name="message" className="w-3 h-3" /> {commentCount}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 px-4 pt-2.5">
        {tags.map((t) => (
          <button
            key={t}
            onClick={() => removeTag(t)}
            className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600"
            title="حذف تگ"
          >
            #{t}
          </button>
        ))}
        <button
          onClick={addTag}
          className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border border-dashed border-line text-muted"
        >
          <Icon name="plus" className="w-3 h-3" /> تگ
        </button>
      </div>

      <CodeMirror
        value={code}
        onChange={handleChange}
        theme={dracula}
        extensions={extensions}
        indentWithTab
        minHeight="100px"
        maxHeight="620px"
        basicSetup={basicSetup}
        autoFocus={autoFocus}
        onCreateEditor={handleCreateEditor}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            run();
          }
        }}
      />

      {showSkeleton ? (
        <div className="px-4 py-4 bg-[#0b1020] space-y-2.5 min-h-[96px]" aria-label="در حال اجرا">
          <Skeleton dark className="h-3 w-1/4" />
          <Skeleton dark className="h-3 w-2/3" />
          <Skeleton dark className="h-3 w-1/2" />
        </div>
      ) : (
        (output || pendingPrompt !== null) && (
          <div className={isError ? "bg-red-950/90 text-red-300" : "bg-[#0b1020] text-emerald-400"} dir="ltr">
            {output && (
              <pre className="px-4 pt-4 pb-3 min-h-[72px] max-h-96 overflow-auto text-[13.5px] leading-6 font-mono whitespace-pre-wrap text-left">
                {output}
              </pre>
            )}
            {pendingPrompt !== null && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitInput();
                }}
                className="flex items-center gap-2 px-4 pb-4 pt-1 font-mono text-[13.5px]"
              >
                <span className="text-emerald-300 whitespace-pre-wrap break-words max-w-[55%]">{pendingPrompt || "›"}</span>
                <input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && cancelInput()}
                  placeholder="ورودی رو بنویس و Enter بزن…"
                  autoComplete="off"
                  spellCheck={false}
                  className="flex-1 min-w-0 bg-white/10 text-emerald-100 placeholder:text-slate-500 rounded-lg px-3 py-1.5 outline-none ring-1 ring-emerald-400/40 focus:ring-emerald-300"
                />
                <button type="submit" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold shrink-0">
                  <Icon name="send" className="w-3.5 h-3.5" /> ارسال
                </button>
                <button type="button" onClick={cancelInput} className="text-slate-400 hover:text-white text-xs shrink-0">
                  لغو
                </button>
              </form>
            )}
          </div>
        )
      )}

      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-t border-line">
        <button
          onClick={run}
          disabled={running}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white disabled:opacity-50"
        >
          <Icon name="play" className="w-3.5 h-3.5" />
          {running ? "در حال اجرا…" : "اجرا"}
        </button>
        <button
          onClick={manualSave}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-line bg-white"
        >
          <Icon name="save" className="w-3.5 h-3.5" />
          ذخیره
        </button>
        <button
          onClick={() => setShowComments((s) => !s)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-line bg-white"
        >
          <Icon name="message" className="w-3.5 h-3.5" />
          نظر
        </button>
        {canDelete && (
          <button
            onClick={del}
            className="mr-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-danger border border-red-200 bg-white"
            title={isOwn ? "حذف سلول من" : "حذف سلول توسط معلم"}
          >
            <Icon name="trash" className="w-3.5 h-3.5" />
            حذف
          </button>
        )}
      </div>

      {showComments && (
        <div className="px-4 pb-4">
          <CommentsPanel cellId={cell.id} onCountChange={setCommentCount} />
        </div>
      )}
    </div>
  );
}
