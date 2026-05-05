// Lightweight unified-diff renderer. Server component — no client JS.
//
// Why hand-rolled instead of pulling in `diff` / `jsdiff`: the operator only
// needs to see what changed between two markdown bundles a few times a week.
// A line-level Myers-style diff gives them a perfectly readable view in
// under 60 LoC, no dependency, no client bundle hit.
//
// Algorithm: standard longest-common-subsequence on lines. Emits a sequence
// of {kind: keep|add|del, content} ops, then renders them with sticky line
// numbers.

type DiffOp =
  | { kind: "keep"; before: string; beforeNo: number; afterNo: number }
  | { kind: "add"; after: string; afterNo: number }
  | { kind: "del"; before: string; beforeNo: number };

/** Normalize line endings so CRLF (browser textarea submits) and LF (file
 *  on disk / Storage) compare equal line by line. Without this, every
 *  unchanged line still shows up as both removed and added because
 *  `"foo\r"` !== `"foo"`. */
function normalizeNewlines(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function lineDiff(before: string, after: string): DiffOp[] {
  const a = normalizeNewlines(before).split("\n");
  const b = normalizeNewlines(after).split("\n");
  const m = a.length;
  const n = b.length;

  // LCS lengths table.
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) lcs[i]![j] = (lcs[i + 1]![j + 1] ?? 0) + 1;
      else lcs[i]![j] = Math.max(lcs[i + 1]![j] ?? 0, lcs[i]![j + 1] ?? 0);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      ops.push({ kind: "keep", before: a[i] ?? "", beforeNo: i + 1, afterNo: j + 1 });
      i++;
      j++;
    } else if ((lcs[i + 1]?.[j] ?? 0) >= (lcs[i]?.[j + 1] ?? 0)) {
      ops.push({ kind: "del", before: a[i] ?? "", beforeNo: i + 1 });
      i++;
    } else {
      ops.push({ kind: "add", after: b[j] ?? "", afterNo: j + 1 });
      j++;
    }
  }
  while (i < m) {
    ops.push({ kind: "del", before: a[i] ?? "", beforeNo: i + 1 });
    i++;
  }
  while (j < n) {
    ops.push({ kind: "add", after: b[j] ?? "", afterNo: j + 1 });
    j++;
  }
  return ops;
}

function classify(ops: DiffOp[]) {
  let added = 0;
  let removed = 0;
  for (const op of ops) {
    if (op.kind === "add") added++;
    else if (op.kind === "del") removed++;
  }
  return { added, removed, kept: ops.length - added - removed };
}

export function DiffView({
  before,
  after,
  beforeLabel = "Versión activa",
  afterLabel = "Esta versión",
}: {
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
}) {
  const ops = lineDiff(before, after);
  const stats = classify(ops);

  if (normalizeNewlines(before) === normalizeNewlines(after)) {
    return (
      <div className="card text-sm text-ink-500">
        Sin cambios respecto de la versión activa.
      </div>
    );
  }

  return (
    <div className="card !p-0 overflow-hidden">
      <header className="flex items-baseline justify-between border-b border-ink-100 px-4 py-2 text-xs">
        <div className="flex gap-2 font-medium text-ink-700">
          <span>{beforeLabel}</span>
          <span className="text-ink-400">→</span>
          <span>{afterLabel}</span>
        </div>
        <div className="flex gap-3 tabular-nums">
          <span className="text-ok-700">+{stats.added}</span>
          <span className="text-bad-700">-{stats.removed}</span>
          <span className="text-ink-400">={stats.kept}</span>
        </div>
      </header>
      <div className="font-mono text-[11px] leading-relaxed max-h-[60vh] overflow-y-auto">
        {ops.map((op, idx) => {
          const beforeNo = op.kind === "add" ? "" : (op as { beforeNo?: number }).beforeNo ?? "";
          const afterNo = op.kind === "del" ? "" : (op as { afterNo?: number }).afterNo ?? "";
          const text =
            op.kind === "keep"
              ? op.before
              : op.kind === "del"
                ? op.before
                : op.after;
          const bg =
            op.kind === "add"
              ? "bg-ok-50/70"
              : op.kind === "del"
                ? "bg-bad-50/80"
                : "";
          const sign = op.kind === "add" ? "+" : op.kind === "del" ? "-" : " ";
          const signColor =
            op.kind === "add"
              ? "text-ok-700"
              : op.kind === "del"
                ? "text-bad-700"
                : "text-ink-300";
          return (
            <div key={idx} className={`flex ${bg}`}>
              <span className="w-10 text-right pr-2 select-none text-ink-400 tabular-nums">
                {beforeNo}
              </span>
              <span className="w-10 text-right pr-2 select-none text-ink-400 tabular-nums">
                {afterNo}
              </span>
              <span className={`w-4 select-none ${signColor}`}>{sign}</span>
              <pre className="flex-1 whitespace-pre-wrap break-words text-ink-800 pr-3 py-0.5">
                {text || " "}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}
