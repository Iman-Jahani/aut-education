// Pure helpers around Jupyter notebooks (.ipynb, nbformat 4).
// Kept free of React / Supabase so they can be unit-tested with plain Node.

export interface NotebookCellLike {
  cell_type?: string;
  source?: string[] | string;
}

/** Rows that the class page inserts into the `cells` table. */
export interface CellRowInput {
  code: string;
  position: number;
}

/**
 * Converts the cells of a parsed .ipynb into rows for our `cells` table.
 * - code cells keep their source as-is
 * - markdown/raw cells become commented Python so they stay readable
 * - empty cells are skipped
 * - `position` increases by POSITION_STEP for every row (same idea as addCell)
 */
export function notebookToRows(nb: unknown, startPosition: number, step = 1000): CellRowInput[] {
  const cells = (nb as { cells?: NotebookCellLike[] } | null)?.cells;
  if (!Array.isArray(cells)) return [];

  const rows: CellRowInput[] = [];
  let position = startPosition;
  for (const c of cells) {
    const src = Array.isArray(c?.source) ? c.source.join("") : typeof c?.source === "string" ? c.source : "";
    if (!src.trim()) continue;
    const isCode = c.cell_type === "code";
    const code = isCode ? src : src.split("\n").map((l) => (l.trim() ? "# " + l : "#")).join("\n");
    rows.push({ code, position });
    position += step;
  }
  return rows;
}

export interface CellLike {
  code: string | null;
  output?: string | null;
}

const toLines = (s: string): string[] => {
  const parts = s.split("\n");
  return parts.map((l, i) => (i < parts.length - 1 ? l + "\n" : l));
};

/**
 * Builds a downloadable notebook (nbformat 4.5) out of the class cells.
 * Saved outputs are attached as stdout streams.
 */
export function cellsToNotebook(cells: CellLike[]): Record<string, unknown> {
  return {
    cells: cells.map((c) => ({
      cell_type: "code",
      execution_count: null,
      metadata: {},
      outputs: c.output
        ? [
            {
              output_type: "stream",
              name: "stdout",
              text: c.output.endsWith("\n") ? c.output : c.output + "\n",
            },
          ]
        : [],
      source: toLines(c.code || ""),
    })),
    metadata: {
      kernelspec: { display_name: "Python 3", language: "python", name: "python3" },
      language_info: { name: "python" },
    },
    nbformat: 4,
    nbformat_minor: 5,
  };
}

/** Safe download file name out of the class title. */
export function notebookFileName(title: string, code: string): string {
  return `${(title || code).replace(/[\\/:*?"<>|]/g, "_")}.ipynb`;
}
