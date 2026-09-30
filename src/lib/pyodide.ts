// Lazily loads Pyodide from the CDN (same version the old app used) and
// keeps a single shared instance around so every code cell can run Python
// without re-downloading the ~10MB runtime each time.

import { CELL_RUNNER_SETUP, TEST_INPUT_SETUP } from "./pyRunner";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PyodideInterface = any;

declare global {
  interface Window {
    loadPyodide?: (opts: { indexURL: string }) => Promise<PyodideInterface>;
  }
}

const PYODIDE_VERSION = "0.26.2";
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

let pyodidePromise: Promise<PyodideInterface> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Pyodide script"));
    document.head.appendChild(script);
  });
}

export function getPyodide(): Promise<PyodideInterface> {
  if (pyodidePromise) return pyodidePromise;
  pyodidePromise = (async () => {
    await loadScript(`${PYODIDE_CDN}pyodide.js`);
    if (!window.loadPyodide) throw new Error("Pyodide failed to load");
    return window.loadPyodide({ indexURL: PYODIDE_CDN });
  })();
  return pyodidePromise;
}

// Captures stdout+stderr as raw bytes (exact text, including partial lines such
// as print("x", end="")). Call the returned function to read what was written.
function captureStdio(pyodide: PyodideInterface): () => string {
  const chunks: Uint8Array[] = [];
  const handler = {
    write: (buf: Uint8Array) => {
      chunks.push(buf.slice());
      return buf.length;
    },
  };
  pyodide.setStdout(handler);
  pyodide.setStderr(handler);
  return () => {
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const merged = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      merged.set(c, off);
      off += c.length;
    }
    return new TextDecoder().decode(merged);
  };
}

async function flushStdio(pyodide: PyodideInterface) {
  try {
    await pyodide.runPythonAsync("import sys\nsys.stdout.flush()\nsys.stderr.flush()");
  } catch {
    /* ignore */
  }
}

export interface RunResult {
  output: string;
  /** Prompt text when the program called input() and is waiting for an answer, else null. */
  needInput: string | null;
  isError: boolean;
}

/**
 * Runs a code cell. `inputs` are the answers already given to input() calls
 * (replayed in order); if the program asks for one more, `needInput` holds the
 * prompt and the caller should collect the answer and call again with it appended.
 */
export async function runPython(code: string, inputs: string[] = [], seed = 1): Promise<RunResult> {
  const pyodide = await getPyodide();
  const read = captureStdio(pyodide);
  try {
    if (inputs.length === 0) await pyodide.loadPackagesFromImports(code);
    await ensureCellRunner(pyodide);
    const runCell = pyodide.globals.get("__run_cell");
    let res: unknown;
    try {
      res = runCell(code, JSON.stringify(inputs), seed);
    } finally {
      runCell.destroy();
    }
    const output = read().replace(/\s+$/, "");
    if (typeof res === "string" && res.startsWith("P:")) return { output, needInput: res.slice(2), isError: false };
    return { output, needInput: null, isError: res === "E" };
  } catch (e) {
    await flushStdio(pyodide);
    return { output: (read() + "\nError: " + (e as Error).message).trim(), needInput: null, isError: true };
  }
}

let cellRunnerReady = false;
async function ensureCellRunner(pyodide: PyodideInterface): Promise<void> {
  if (cellRunnerReady) return;
  await pyodide.runPythonAsync(CELL_RUNNER_SETUP);
  cellRunnerReady = true;
}

function normalizeOutput(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}

export interface TestCaseInput {
  input?: string;
  expected?: string;
}

export interface TestRunResult {
  input: string;
  expected: string;
  actual: string;
  passed: boolean;
  error: string | null;
}

// Runs `code` once per test case, feeding `input` as stdin lines and
// comparing normalized stdout against `expected`. Mirrors the exercise
// checker from the original class-23.html.
export async function runTestCases(
  code: string,
  tests: TestCaseInput[]
): Promise<TestRunResult[]> {
  const pyodide = await getPyodide();
  await pyodide.loadPackagesFromImports(code);
  const results: TestRunResult[] = [];

  for (const test of tests) {
    const read = captureStdio(pyodide);

    const inputStr = test.input == null ? "" : String(test.input);
    let queue: string[];
    if (inputStr.length === 0) {
      queue = [];
    } else {
      const lines = inputStr.split("\n");
      while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
      queue = lines.map((l) => l + "\n");
    }
    pyodide.setStdin({ stdin: () => (queue.length === 0 ? null : queue.shift()) });

    let err: string | null = null;
    let g: PyodideInterface | null = null;
    try {
      g = pyodide.globals.get("dict")();
      // Shared queue: sys.stdin reads lines (with "\\n"), input() gets them without
      // the newline and without echoing the prompt.
      g.set("__next_input", () => (queue.length ? String(queue.shift()).replace(/\r?\n$/, "") : undefined));
      await pyodide.runPythonAsync(TEST_INPUT_SETUP, { globals: g });
      await pyodide.runPythonAsync(code, { globals: g });
    } catch (e) {
      err = String((e as Error).message || e);
    } finally {
      await flushStdio(pyodide);
      if (g) {
        try {
          g.destroy();
        } catch {
          /* ignore */
        }
      }
    }

    const rawOut = read().replace(/\n$/, "");
    const actual = err ? "Error: " + err : rawOut;
    const passed = !err && normalizeOutput(rawOut) === normalizeOutput(test.expected);
    results.push({
      input: test.input || "",
      expected: test.expected || "",
      actual: actual || "(بدون خروجی)",
      passed,
      error: err,
    });
  }

  try {
    pyodide.setStdin({ stdin: () => null });
  } catch {
    /* ignore */
  }

  return results;
}
