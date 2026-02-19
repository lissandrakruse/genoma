export type UnifiedHunk = {
  header: string;
  oldStart: number;
  lines: string[];
};

export type UnifiedFileDiff = {
  path: string;
  hunks: UnifiedHunk[];
};

export type WorkspaceFileBlock = {
  path: string;
  content: string;
};

export type ApplyPreview = {
  kind: "diff" | "blocks";
  parsedFiles: number;
  files: string[];
  hunks: Array<{ id: string; path: string; header: string; index: number }>;
};

function normalizeDiffPath(p: string): string {
  const raw = String(p || "").trim().replace(/^["']|["']$/g, "");
  if (!raw) {
    return "";
  }
  return raw.replace(/^a\//, "").replace(/^b\//, "");
}

export function parseUnifiedDiff(text: string): UnifiedFileDiff[] {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const files: UnifiedFileDiff[] = [];
  let current: UnifiedFileDiff | null = null;
  let currentHunk: UnifiedHunk | null = null;

  const pushHunk = () => {
    if (current && currentHunk) {
      current.hunks.push(currentHunk);
      currentHunk = null;
    }
  };
  const pushFile = () => {
    pushHunk();
    if (current && current.path && current.hunks.length) {
      files.push(current);
    }
    current = null;
  };

  for (const line of lines) {
    const diffMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (diffMatch) {
      pushFile();
      current = { path: normalizeDiffPath(diffMatch[2]), hunks: [] };
      continue;
    }

    const plusMatch = line.match(/^\+\+\+ (.+)$/);
    if (plusMatch) {
      const p = normalizeDiffPath(plusMatch[1]);
      if (!current && p) {
        current = { path: p, hunks: [] };
      } else if (current && p) {
        current.path = p;
      }
      continue;
    }

    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/);
    if (hunkMatch && current) {
      pushHunk();
      currentHunk = {
        header: line.trim(),
        oldStart: Number(hunkMatch[1]),
        lines: [],
      };
      continue;
    }

    if (currentHunk) {
      const prefix = line[0];
      if (prefix === " " || prefix === "+" || prefix === "-" || line.startsWith("\\")) {
        currentHunk.lines.push(line);
      }
    }
  }

  pushFile();
  return files;
}

export function applyUnifiedDiffToText(originalText: string, file: UnifiedFileDiff): string | null {
  const hasCRLF = /\r\n/.test(originalText);
  const srcLines = originalText.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let cursor = 0;

  for (const hunk of file.hunks) {
    const target = Math.max(0, hunk.oldStart - 1);
    if (target < cursor) {
      return null;
    }
    out.push(...srcLines.slice(cursor, target));
    let i = target;

    for (const l of hunk.lines) {
      if (!l) {
        continue;
      }
      if (l.startsWith("\\")) {
        continue;
      }
      const kind = l[0];
      const content = l.slice(1);

      if (kind === " ") {
        if (srcLines[i] !== content) {
          return null;
        }
        out.push(srcLines[i]);
        i += 1;
        continue;
      }
      if (kind === "-") {
        if (srcLines[i] !== content) {
          return null;
        }
        i += 1;
        continue;
      }
      if (kind === "+") {
        out.push(content);
      }
    }

    cursor = i;
  }

  out.push(...srcLines.slice(cursor));
  const merged = out.join("\n");
  return hasCRLF ? merged.replace(/\n/g, "\r\n") : merged;
}

export function parseWorkspaceFileBlocks(text: string): WorkspaceFileBlock[] {
  const src = String(text || "").replace(/\r\n/g, "\n");
  const blocks: WorkspaceFileBlock[] = [];
  const re = /(?:^|\n)(?:File|Arquivo)\s*:\s*(.+?)\n```[^\n]*\n([\s\S]*?)```/gim;
  let m: RegExpExecArray | null;

  while ((m = re.exec(src)) !== null) {
    const path = normalizeDiffPath(String(m[1] || "").trim());
    const content = String(m[2] || "").replace(/\n$/, "");
    if (path && content) {
      blocks.push({ path, content });
    }
  }

  return blocks;
}

export function buildApplyPreview(raw: string): ApplyPreview | null {
  const diffFiles = parseUnifiedDiff(raw);
  if (diffFiles.length) {
    const files = diffFiles.map((f) => f.path).filter(Boolean);
    const hunks: Array<{ id: string; path: string; header: string; index: number }> = [];
    for (const f of diffFiles) {
      f.hunks.forEach((h, idx) => {
        hunks.push({
          id: `${f.path}#${idx}`,
          path: f.path,
          header: h.header || "@@",
          index: idx,
        });
      });
    }
    return { kind: "diff", parsedFiles: diffFiles.length, files, hunks };
  }

  const blockFiles = parseWorkspaceFileBlocks(raw);
  if (blockFiles.length) {
    const files = blockFiles.map((b) => b.path).filter(Boolean);
    return { kind: "blocks", parsedFiles: blockFiles.length, files, hunks: [] };
  }

  return null;
}
