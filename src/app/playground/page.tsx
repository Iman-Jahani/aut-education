"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ToastProvider";
import CodeCell, { type CodeCellRow } from "@/components/CodeCell";
import ProfileModal from "@/components/ProfileModal";
import Icon from "@/components/Icon";
import { Skeleton, CellSkeleton } from "@/components/Skeleton";
import {
  listNotebooks,
  createNotebook,
  renameNotebook,
  deleteNotebook,
  listNotebookCells,
  addNotebookCell,
  seedNotebook,
} from "@/lib/playground";
import { notebookToRows, cellsToNotebook, notebookFileName } from "@/lib/notebook";
import type { Notebook, NotebookCell } from "@/lib/types";

// Playground — write and run Python without joining any class.
// Personal notebooks live in `user_notebooks` / `user_notebook_cells`
// (see supabase/PLAYGROUND.sql) and are private to the signed-in user.

const eff = (c: NotebookCell) => c.position ?? new Date(c.created_at).getTime();
const sortByPos = (list: NotebookCell[]) => [...list].sort((a, b) => eff(a) - eff(b));

function InsertDivider({ onClick, label = "سلول جدید اینجا" }: { onClick: () => void; label?: string }) {
  return (
    <div className="insert-divider group relative h-8 flex items-center justify-center">
      <div className="absolute inset-x-8 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition" />
      <button
        onClick={onClick}
        className="insert-btn relative z-10 flex items-center gap-1 px-3 py-1 rounded-full bg-white border border-primary/30 text-primary text-[11px] font-bold shadow-soft hover:bg-primary hover:text-white transition-colors"
      >
        <Icon name="plus" className="w-3.5 h-3.5" /> {label}
      </button>
    </div>
  );
}

export default function PlaygroundPage() {
  const { user, ready, needsProfile, displayName, avatar, signOut } = useAuth();
  const toast = useToast();

  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const [cells, setCells] = useState<NotebookCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCells, setLoadingCells] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [focusedCellId, setFocusedCellId] = useState<string | null>(null);
  const seededRef = useRef(false);
  const pendingScroll = useRef<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const nbFileRef = useRef<HTMLInputElement>(null);

  const activeNotebook = notebooks.find((n) => n.id === activeNotebookId) || null;

  const loadNotebooks = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let list = await listNotebooks(user.id);
      // Very first visit: give the user a ready-to-use notebook.
      if (list.length === 0 && !seededRef.current) {
        seededRef.current = true;
        const nb = await seedNotebook(user.id, "دفترچه من");
        list = [nb];
      }
      setNotebooks(list);
      setActiveNotebookId((cur) => (cur && list.some((n) => n.id === cur) ? cur : list[0]?.id ?? null));
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "خطا در بارگذاری دفترچه‌ها");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadNotebooks();
  }, [loadNotebooks]);

  const loadCells = useCallback(async () => {
    if (!activeNotebookId) {
      setCells([]);
      return;
    }
    setLoadingCells(true);
    try {
      setCells(sortByPos(await listNotebookCells(activeNotebookId)));
    } catch (e) {
      toast(e instanceof Error ? e.message : "خطا در بارگذاری سلول‌ها", "err");
    } finally {
      setLoadingCells(false);
    }
  }, [activeNotebookId, toast]);

  useEffect(() => {
    void loadCells();
  }, [loadCells]);

  // Scroll to a freshly created cell once it is rendered.
  useEffect(() => {
    const id = pendingScroll.current;
    if (!id) return;
    const el = document.getElementById("cell-" + id);
    if (!el) return;
    pendingScroll.current = null;
    requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "center" }));
    setFlashId(id);
    const t = setTimeout(() => setFlashId(null), 1400);
    return () => clearTimeout(t);
  }, [cells]);

  const addCell = async (afterId?: string | null) => {
    if (!user || !activeNotebookId) return;
    const now = Date.now();
    let position: number;
    if (afterId === undefined) {
      const last = cells[cells.length - 1];
      position = last ? Math.max(now, eff(last) + 1) : now;
    } else if (afterId === null) {
      position = cells.length ? eff(cells[0]) - 1000 : now;
    } else {
      const i = cells.findIndex((c) => c.id === afterId);
      const prev = cells[i];
      const next = cells[i + 1];
      position = next ? (eff(prev) + eff(next)) / 2 : Math.max(now, eff(prev) + 1);
    }
    try {
      const c = await addNotebookCell(user.id, activeNotebookId, position);
      pendingScroll.current = c.id;
      setFocusedCellId(c.id);
      setTimeout(() => setFocusedCellId((curr) => (curr === c.id ? null : curr)), 4000);
      setCells((p) => sortByPos([...p, c]));
    } catch (e) {
      toast(e instanceof Error ? e.message : "افزودن سلول ناموفق بود", "err");
    }
  };

  const newNotebook = async () => {
    if (!user) return;
    const name = window.prompt("نام دفترچه‌ی جدید:", `دفترچه ${notebooks.length + 1}`);
    if (name === null) return;
    try {
      const nb = await createNotebook(user.id, name.trim() || `دفترچه ${notebooks.length + 1}`);
      setNotebooks((p) => [...p, nb]);
      setActiveNotebookId(nb.id);
      toast(`دفترچه «${nb.title}» ساخته شد`, "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : "ساخت دفترچه ناموفق بود", "err");
    }
  };

  const renameActive = async () => {
    if (!activeNotebook) return;
    const name = window.prompt("نام جدید دفترچه:", activeNotebook.title);
    if (name === null || !name.trim() || name.trim() === activeNotebook.title) return;
    const title = name.trim();
    try {
      await renameNotebook(activeNotebook.id, title);
      setNotebooks((p) => p.map((n) => (n.id === activeNotebook.id ? { ...n, title } : n)));
      toast("نام دفترچه عوض شد", "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : "ویرایش ناموفق بود", "err");
    }
  };

  const removeActive = async () => {
    if (!activeNotebook) return;
    if (!confirm(`دفترچه «${activeNotebook.title}» و همه‌ی سلول‌هایش حذف شود؟`)) return;
    try {
      await deleteNotebook(activeNotebook.id);
      const rest = notebooks.filter((n) => n.id !== activeNotebook.id);
      setNotebooks(rest);
      setActiveNotebookId(rest[0]?.id ?? null);
      toast("دفترچه حذف شد", "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : "حذف ناموفق بود", "err");
    }
  };

  const importNotebookFile = async (file: File) => {
    if (!user || !activeNotebook) return;
    setImporting(true);
    try {
      const nb = JSON.parse(await file.text());
      const start = cells.length ? eff(cells[cells.length - 1]) + 1000 : Date.now();
      const rows = notebookToRows(nb, start).map((r) => ({
        notebook_id: activeNotebook.id,
        user_id: user.id,
        code: r.code,
        output: "",
        tags: [],
        position: r.position,
      }));
      if (!rows.length) {
        toast("هیچ سلولی توی فایل ipynb پیدا نشد", "err");
        return;
      }
      const { error } = await supabase.from("user_notebook_cells").insert(rows);
      if (error) {
        toast("خطا: " + error.message, "err");
        return;
      }
      toast(`${rows.length} سلول از ipynb اضافه شد`, "ok");
      await loadCells();
    } catch {
      toast("فایل ipynb معتبر نیست", "err");
    } finally {
      setImporting(false);
      if (nbFileRef.current) nbFileRef.current.value = "";
    }
  };

  const exportNotebook = () => {
    if (!activeNotebook) return;
    if (!cells.length) {
      toast("سلولی برای خروجی گرفتن نیست", "err");
      return;
    }
    const nb = cellsToNotebook(cells.map((c: CodeCellRow) => ({ code: c.code, output: c.output })));
    const blob = new Blob([JSON.stringify(nb, null, 1)], { type: "application/x-ipynb+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = notebookFileName(activeNotebook.title, "playground");
    a.click();
    URL.revokeObjectURL(url);
    toast("خروجی ipynb دانلود شد", "ok");
  };

  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Skeleton className="w-40 h-6" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28">
      <header className="sticky top-0 z-40 glass">
        <div className="max-w-4xl mx-auto px-4 pt-3 pb-2.5 flex items-center gap-2">
          <Link href="/" className="w-9 h-9 rounded-xl grid place-items-center text-white shadow-soft shrink-0" style={{ background: "var(--grad)" }} title="صفحه اصلی">
            <Icon name="terminal" className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <div className="font-extrabold text-sm">دفترچه آزاد</div>
            <div className="text-[11px] text-muted">بدون کلاس بنویس، اجرا کن و ذخیره کن</div>
          </div>
          <div className="flex-1" />
          <Link href="/dashboard" className="btn-ghost hidden sm:inline-flex">
            <Icon name="chart" className="w-4 h-4" /> داشبورد
          </Link>
          <button
            onClick={() => setProfileOpen(true)}
            className={`flex items-center gap-2 pl-3 pr-1 py-1 rounded-full bg-white border hover:shadow-soft transition ${
              needsProfile ? "border-primary/40 ring-2 ring-primary/25" : "border-line"
            }`}
            title={needsProfile ? "نام و آواتارت را تنظیم کن" : "پروفایل"}
          >
            <span className="w-7 h-7 rounded-full bg-indigo-50 grid place-items-center text-base">{avatar}</span>
            <span className="text-xs font-bold max-w-[90px] truncate hidden sm:block">{displayName || "پروفایل"}</span>
          </button>
          <button onClick={() => void signOut()} className="btn-ghost" title="خروج از حساب">
            <Icon name="logout" className="w-4 h-4" />
          </button>
        </div>

        {/* Notebook switcher */}
        {notebooks.length > 0 && (
          <div className="max-w-4xl mx-auto px-4 pb-2.5 flex items-center gap-1.5 flex-wrap">
            <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-muted">
              <Icon name="book" className="w-3.5 h-3.5" /> دفترچه
            </span>
            <select
              value={activeNotebookId ?? ""}
              onChange={(e) => setActiveNotebookId(e.target.value)}
              className="border border-line rounded-full px-3 py-1.5 text-[12px] font-bold bg-white outline-none focus:border-primary max-w-[14rem]"
            >
              {notebooks.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
            </select>
            <button onClick={newNotebook} className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-bold border border-dashed border-primary/40 text-primary bg-white hover:bg-primary/5">
              <Icon name="plus" className="w-3.5 h-3.5" /> دفترچه جدید
            </button>
            {activeNotebook && (
              <div className="shrink-0 flex items-center gap-1">
                <button onClick={renameActive} title="تغییر نام" className="w-7 h-7 grid place-items-center rounded-lg border border-line bg-white text-muted hover:text-primary">
                  <Icon name="edit" className="w-3.5 h-3.5" />
                </button>
                <button onClick={removeActive} title="حذف دفترچه" className="w-7 h-7 grid place-items-center rounded-lg border border-red-200 bg-white text-danger">
                  <Icon name="trash" className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </header>

  <main className="max-w-4xl mx-auto px-4 py-6">
        {loadError ? (
          <div className="card p-8 text-center">
            <div className="flex justify-center text-primary mb-3">
              <Icon name="alert" className="w-10 h-10" />
            </div>
            <h3 className="font-extrabold mb-1">دفترچه‌ی آزاد راه‌اندازی نشده</h3>
            <p className="text-sm text-muted leading-7">
              محتوای فایل{" "}
              <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">supabase/PLAYGROUND.sql</code> را یک‌بار در
              SQL Editor سوپابیس اجرا کن تا جدول‌های دفترچه ساخته شوند.
            </p>
            <p className="text-xs text-danger mt-3" dir="ltr">
              {loadError}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
              <div>
                <h2 className="font-extrabold text-lg flex items-center gap-2">
                  <Icon name="terminal" className="w-5 h-5 text-primary" />
                  {activeNotebook?.title || "دفترچه آزاد"}
                </h2>
                <p className="text-xs text-muted mt-0.5">{cells.length} سلول · فقط خودت این‌ها را می‌بینی</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  ref={nbFileRef}
                  type="file"
                  accept=".ipynb,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void importNotebookFile(f);
                  }}
                />
                <button
                  onClick={() => nbFileRef.current?.click()}
                  disabled={importing || !activeNotebook}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white border border-line hover:shadow-soft transition disabled:opacity-50"
                  title="آپلود فایل ipynb"
                >
                  <Icon name="upload" className="w-4 h-4" />
                  {importing ? "در حال خواندن…" : "آپلود ipynb"}
                </button>
                <button
                  onClick={exportNotebook}
                  disabled={!activeNotebook}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white shadow-soft transition disabled:opacity-50"
                  style={{ background: "var(--grad)" }}
                  title="خروجی ipynb از سلول‌های این دفترچه"
                >
                  <Icon name="download" className="w-4 h-4" />
                  خروجی ipynb
                </button>
              </div>
            </div>

            <div>
              {loading || loadingCells ? (
                <div className="space-y-4">
                  <CellSkeleton />
                  <CellSkeleton />
                </div>
              ) : cells.length === 0 ? (
                <div className="card text-center py-16 px-6 anim-pop">
                  <div className="flex justify-center text-primary mb-3">
                    <Icon name="sparkles" className="w-10 h-10" />
                  </div>
                  <h3 className="font-extrabold mb-1">شروع کن!</h3>
                  <p className="text-sm text-muted mb-5">یه سلول بساز و اولین کد پایتونت رو بنویس — خودکار ذخیره می‌شه.</p>
                  <button onClick={() => addCell()} className="btn-primary inline-flex items-center gap-1.5">
                    <Icon name="plus" className="w-4 h-4" /> سلول جدید
                  </button>
                </div>
              ) : (
                <>
                  <InsertDivider onClick={() => addCell(null)} label="سلول جدید در ابتدا" />
                  {cells.map((cell) => (
                    <Fragment key={cell.id}>
                      <div id={"cell-" + cell.id} className={`scroll-mt-40 rounded-2xl ${flashId === cell.id ? "cell-flash" : ""}`}>
                        <CodeCell
                          cell={cell}
                          persist={{ table: "user_notebook_cells" }}
                          simple
                          autoFocus={focusedCellId === cell.id}
                          onDeleted={(id) => setCells((p) => p.filter((c) => c.id !== id))}
                        />
                      </div>
                      <InsertDivider onClick={() => addCell(cell.id)} />
                    </Fragment>
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </main>

      {!loadError && activeNotebook && (
        <button
          onClick={() => addCell()}
          className="fixed bottom-6 left-6 z-50 h-14 pl-4 pr-5 rounded-full text-white font-bold shadow-lift inline-flex items-center gap-2 hover:scale-105 transition"
          style={{ background: "var(--grad)" }}
          title="سلول جدید"
        >
          <Icon name="plus" className="w-5 h-5" /> سلول جدید
        </button>
      )}

      <ProfileModal open={profileOpen} firstTime={needsProfile} onClose={() => setProfileOpen(false)} />
    </div>
  );
}