import * as vscode from "vscode";
import { request as httpRequest, RequestOptions } from "http";
import { request as httpsRequest } from "https";
import { URL } from "url";
import { exec as execCb } from "child_process";
import { promisify } from "util";
import { createHash, randomBytes, randomUUID } from "crypto";
import { getHtml } from "./webviewHtml";
import { isActionAllowedForMode, normalizeActionForMode, allowedActionsHint } from "./actionRules";
import {
  ModelStrategy,
  TimedValueCache,
  extractCloudModelsFromText as parseCloudModels,
  pickModel as chooseModel,
  rankModelsByStrategy,
  scoreAnswerQuality as computeAnswerQuality,
  sortModelsByQuality as sortByModelQuality,
} from "./modelHeuristics";
import {
  defaultPolicyTemplateJson,
  evaluatePolicy,
  mergePolicyConfigs,
  parseExtendedPolicyFile,
  parsePolicyConfig,
  type PolicyConfig,
  type PolicyVerdict,
} from "./policyCore";
import { computeTrustByDomain, minTrustForDomains } from "./trustCore";
import { buildCustodySignedEntry, verifyCustodySignedEntry } from "./custodyCore";

/** ---------------- Types ---------------- */

type Mode = "code" | "ds" | "devds" | "infra" | "devops" | "pbi";
type Action =
  | "explain"
  | "refactor"
  | "tests"
  | "fix"
  | "review"
  | "security"
  | "eda"
  | "sql"
  | "features"
  | "train_eval"
  | "debug"
  | "doc"
  | "infra_ps"
  | "infra_ci"
  | "infra_iac"
  | "infra_obs"
  | "infra_secops"
  | "infra_runbook"
  | "pbi_model"
  | "pbi_m"
  | "pbi_dax"
  | "pbi_visuals"
  | "pbi_checks"
  | null;

type ContextMode = "off" | "selection" | "file" | "workspace";

type UIFlags = { useSelection: boolean; useFile: boolean; useWorkspace: boolean };

type Endpoint = {
  id: string;
  name: string;
  baseUrl: string; // ex: http://localhost:11434  OR  https://ollama.com
  defaultModel: string;
};

type Config = {
  endpoints: Endpoint[];
  activeEndpointId: string;
  lastModel: string;
  maxContextChars: number;
  maxContextTokens: number;
  workspaceContextMaxFiles: number;
  workspaceContextCacheMs: number;
  validateCommand: string;
  policyEnabled: boolean;
  policyFile: string;
  policyProfile: string;
  policyRiskThreshold: number;
  policyDynamicThresholdEnabled: boolean;
  policyRollbackPenaltyStartPct: number;
  policyRollbackPenaltyMax: number;
  policyRequireJustification: boolean;
  policyDualApprovalEnabled: boolean;
  policySecondApproverRequired: boolean;
  policyTrustEnabled: boolean;
  policyTrustMinScoreAutoApply: number;
  policyTrustLowScoreRiskPenalty: number;
  policyCustodySigningEnabled: boolean;
  policyGitProvenanceEnabled: boolean;
  policyGitCreateBranch: boolean;
  policyGitCommitEnabled: boolean;
  policyGitCommitSignoff: boolean;
  policyGitCommitGpgSign: boolean;
  policyGitBranchPrefix: string;
  timeoutMs: number;
  auditLogEnabled: boolean;
  telemetryOptIn: boolean;

  superChatDefaultMode: Mode;
  superChatDefaultContext: ContextMode;
  superChatDefaultTemperature: number;
  superChatHistoryMaxChars: number;

  cloudApiKeySetting: string; // fallback (settings)
  modelStrategy: ModelStrategy;
  cloudCatalogFallbackEnabled: boolean;
  cloudCatalogMaxSources: number;
};

type UIMessage =
  | { type: "init" }
  | { type: "stop" }
  | { type: "rollbackLastApply" }
  | { type: "applyAndValidate" }
  | { type: "setActiveEndpoint"; endpointId: string }
  | { type: "chooseLocalModel" }
  | { type: "testLocalConnection" }
  | { type: "openCloudLogin" }
  | { type: "openCloudToken" }
  | { type: "copyLast" }
  | { type: "applyLast" }
  | { type: "copyText"; text: string }
  | { type: "applyText"; text: string }
  | { type: "refreshModels"; endpointId?: string }
  | {
      type: "send";
      assistantId: string;
      endpointId?: string;
      model?: string;
      temperature?: number;
      systemPrompt?: string;
      mode: Mode;
      action: Action;
      text: string;
      flags: UIFlags;
    };

type WebviewOut =
  | { type: "init"; endpoints: Endpoint[]; activeEndpointId: string; models: string[]; hasCloudKey: boolean }
  | { type: "models"; endpointId: string; models: string[] }
  | { type: "activeEndpoint"; endpointId: string }
  | { type: "applyPreview"; markdown: string }
  | { type: "metrics"; summary: string }
  | { type: "heatmap"; markdown: string }
  | { type: "heatmapRows"; rows: Array<{ domain: string; rollbackRate: number; validateRate: number; blockRate: number; overrideRate: number; topRule: string }> }
  | { type: "cloudKeyStatus"; configured: boolean }
  | { type: "localStatus"; online: boolean; endpointName?: string; modelCount: number; error?: string }
  | { type: "token"; assistantId: string; token: string }
  | { type: "done"; assistantId: string }
  | { type: "error"; error: string; assistantId?: string }
  | { type: "info"; message: string; assistantId?: string };

type TagsResponse = { models?: Array<{ name?: unknown }> };
type ErrorKind = "timeout" | "auth" | "rate_limit" | "server" | "network" | "other";
type AutoLane = "dev" | "devops" | "ds" | "other";

/** ---------------- Utils ---------------- */

const CODEX_SYSTEM_PROMPT = [
  "You are Codex, a pragmatic senior software engineer working inside VS Code Copilot chat.",
  "Primary goal: help the user ship working code changes safely.",
  "Operating flow:",
  "- Understand request and constraints quickly.",
  "- Propose the smallest safe change that solves it.",
  "- Provide concrete code changes and validation steps.",
  "Behavior rules:",
  "- Be direct and concise. Avoid fluff.",
  "- Avoid cheerleading or motivational language.",
  "- If the request is ambiguous, ask at most one short clarifying question.",
  "- If user asks for a review, present findings first, ordered by severity, with file/line references when possible.",
  "- If user asks to implement/fix, provide actionable steps and concrete code.",
  "- Start with the solution/result, then only the essential context.",
  "- State assumptions, risks, and tradeoffs explicitly.",
  "- Keep responses practical and focused on the requested outcome.",
  "- Default response structure for engineering tasks: Result, Changes, Validation.",
  "Output rules:",
  "- Match the user's language (Portuguese if the user writes in Portuguese).",
  "- Use short Markdown sections only when helpful.",
].join("\n");

const ENGINEERING_RESPONSE_RUBRIC = [
  "Quality bar:",
  "- Validate assumptions and mention risks explicitly.",
  "- Prefer minimal, safe, reversible changes.",
  "- Include verification steps/tests when relevant.",
  "- For reviews, list findings first by severity.",
].join("\n");

const CLOUD_CATALOG_TTL_MS = 10 * 60_000;
const cloudCatalogCacheBySources = new Map<number, TimedValueCache<string[]>>();
const cloudCatalogInflightBySources = new Map<number, Promise<string[]>>();
const execAsync = promisify(execCb);

function normalizeBaseUrl(url: string): string {
  return String(url ?? "").trim().replace(/\/$/, "");
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) {
    return min;
  }
  return Math.max(min, Math.min(max, n));
}

function trimContext(text: string, max: number): string {
  const t = text ?? "";
  if (max <= 0) {
    return "";
  }
  if (t.length <= max) {
    return t;
  }
  return t.slice(0, max) + "\n/* ...trimmed... */";
}

function estimateTokens(text: string): number {
  const t = String(text || "");
  return Math.ceil(t.length / 4);
}

function trimContextByTokens(text: string, maxTokens: number): string {
  if (maxTokens <= 0) {
    return "";
  }
  const t = String(text || "");
  if (!t) {
    return "";
  }
  if (estimateTokens(t) <= maxTokens) {
    return t;
  }
  const targetChars = Math.max(1, maxTokens * 4);
  return t.slice(0, targetChars) + "\n/* ...trimmed by token budget... */";
}

function extractBestCodeForApply(raw: string): string {
  const source = String(raw ?? "");
  if (!source.trim()) {
    return "";
  }

  const blocks: Array<{ lang: string; code: string }> = [];
  const re = /```([^\n`]*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(source)) !== null) {
    const lang = String(m[1] || "").trim().toLowerCase();
    const code = String(m[2] || "").replace(/\r\n/g, "\n").trim();
    if (code) {
      blocks.push({ lang, code });
    }
  }

  if (!blocks.length) {
    return source;
  }

  const nonPatch = blocks.filter((b) => b.lang !== "diff" && b.lang !== "patch");
  const candidates = nonPatch.length ? nonPatch : blocks;
  candidates.sort((a, b) => b.code.length - a.code.length);
  return candidates[0].code;
}

type UnifiedHunk = {
  header: string;
  oldStart: number;
  lines: string[];
};

type UnifiedFileDiff = {
  path: string;
  hunks: UnifiedHunk[];
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

async function tryApplyWorkspaceDiff(
  raw: string,
  allowedPaths?: Set<string>,
  allowedHunks?: Map<string, Set<number>>
): Promise<WorkspaceApplyResult> {
  const files = parseUnifiedDiff(raw);
  if (!files.length) {
    return { parsedFiles: 0, appliedFiles: 0, snapshots: [] };
  }

  const ws = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!ws) {
    return { parsedFiles: files.length, appliedFiles: 0, snapshots: [] };
  }

  const edit = new vscode.WorkspaceEdit();
  let appliedFiles = 0;
  const snapshots: AppliedFileSnapshot[] = [];

  for (const f of files) {
    if (!f.path) {
      continue;
    }
    if (allowedPaths && !allowedPaths.has(f.path)) {
      continue;
    }
    const uri = vscode.Uri.joinPath(ws, f.path);
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const selectedHunks = allowedHunks?.get(f.path);
      const filteredFile =
        selectedHunks && selectedHunks.size
          ? { ...f, hunks: f.hunks.filter((_h, idx) => selectedHunks.has(idx)) }
          : f;
      if (!filteredFile.hunks.length) {
        continue;
      }
      const nextText = applyUnifiedDiffToText(doc.getText(), filteredFile);
      if (nextText === null) {
        continue;
      }
      snapshots.push({ path: f.path, hadFile: true, content: doc.getText() });
      const endLine = Math.max(0, doc.lineCount - 1);
      const endCol = doc.lineCount > 0 ? doc.lineAt(endLine).text.length : 0;
      const fullRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(endLine, endCol));
      edit.replace(uri, fullRange, nextText);
      appliedFiles += 1;
    } catch {
      // Ignore missing/unreadable files in patch apply.
    }
  }

  if (appliedFiles > 0) {
    await vscode.workspace.applyEdit(edit);
  }

  return { parsedFiles: files.length, appliedFiles, snapshots };
}

type WorkspaceFileBlock = {
  path: string;
  content: string;
};

type AppliedFileSnapshot = {
  path: string;
  hadFile: boolean;
  content: string;
};

type WorkspaceApplyResult = {
  parsedFiles: number;
  appliedFiles: number;
  snapshots: AppliedFileSnapshot[];
};

type ApplyPreview = {
  kind: "diff" | "blocks";
  parsedFiles: number;
  files: string[];
  hunks: Array<{ id: string; path: string; header: string; index: number }>;
};

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

async function pickWorkspaceApplyFiles(preview: ApplyPreview): Promise<Set<string> | null> {
  if (!preview.files.length) {
    return null;
  }
  const items = preview.files.map((f) => ({ label: f, picked: true }));
  const picks = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    title: "Select files to apply",
    placeHolder: "Choose one or more files from the generated patch",
    ignoreFocusOut: true,
  });
  if (!picks) {
    return null;
  }
  const selected = new Set(picks.map((p) => p.label));
  if (!selected.size) {
    return null;
  }
  const sample = Array.from(selected).slice(0, 8).join(", ");
  const suffix = selected.size > 8 ? `, +${selected.size - 8} more` : "";
  const choice = await vscode.window.showWarningMessage(
    `Apply ${selected.size} selected file(s)? ${sample}${suffix}`,
    { modal: true },
    "Apply",
    "Cancel"
  );
  return choice === "Apply" ? selected : null;
}

async function pickWorkspaceApplyHunks(
  preview: ApplyPreview,
  selectedPaths: Set<string>
): Promise<Map<string, Set<number>> | null> {
  if (preview.kind !== "diff") {
    return null;
  }
  const scoped = preview.hunks.filter((h) => selectedPaths.has(h.path));
  if (!scoped.length) {
    return null;
  }

  const items = scoped.map((h) => ({
    label: `${h.path}`,
    description: h.header,
    detail: `hunk #${h.index + 1}`,
    picked: true,
    hunk: h,
  }));

  const picks = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    title: "Select hunks to apply",
    placeHolder: "Choose one or more hunks from selected files",
    ignoreFocusOut: true,
  });
  if (!picks || !picks.length) {
    return null;
  }

  const map = new Map<string, Set<number>>();
  for (const p of picks) {
    const path = p.hunk.path;
    const idx = p.hunk.index;
    if (!map.has(path)) {
      map.set(path, new Set<number>());
    }
    map.get(path)!.add(idx);
  }
  return map;
}

async function tryApplyWorkspaceFileBlocks(raw: string, allowedPaths?: Set<string>): Promise<WorkspaceApplyResult> {
  const blocks = parseWorkspaceFileBlocks(raw);
  if (!blocks.length) {
    return { parsedFiles: 0, appliedFiles: 0, snapshots: [] };
  }

  const ws = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!ws) {
    return { parsedFiles: blocks.length, appliedFiles: 0, snapshots: [] };
  }

  let appliedFiles = 0;
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const snapshots: AppliedFileSnapshot[] = [];

  for (const b of blocks) {
    if (allowedPaths && !allowedPaths.has(b.path)) {
      continue;
    }
    try {
      const uri = vscode.Uri.joinPath(ws, b.path);
      let hadFile = false;
      let previous = "";
      try {
        const existing = await vscode.workspace.fs.readFile(uri);
        hadFile = true;
        previous = dec.decode(existing);
      } catch {
        hadFile = false;
        previous = "";
      }
      snapshots.push({ path: b.path, hadFile, content: previous });
      await vscode.workspace.fs.writeFile(uri, enc.encode(b.content));
      appliedFiles += 1;
    } catch {
      // Skip invalid paths and continue.
    }
  }

  return { parsedFiles: blocks.length, appliedFiles, snapshots };
}

async function rollbackWorkspaceApply(snapshots: AppliedFileSnapshot[]): Promise<number> {
  const ws = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!ws || !snapshots.length) {
    return 0;
  }

  const enc = new TextEncoder();
  let rolledBack = 0;

  for (const s of snapshots) {
    const uri = vscode.Uri.joinPath(ws, s.path);
    try {
      if (s.hadFile) {
        await vscode.workspace.fs.writeFile(uri, enc.encode(s.content));
      } else {
        try {
          await vscode.workspace.fs.delete(uri, { recursive: false, useTrash: false });
        } catch {
          // File might have already been removed.
        }
      }
      rolledBack += 1;
    } catch {
      // Continue rollback for remaining files.
    }
  }

  return rolledBack;
}

async function previewWorkspaceDiff(
  raw: string,
  allowedPaths?: Set<string>,
  allowedHunks?: Map<string, Set<number>>
): Promise<boolean> {
  const ws = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!ws) {
    return false;
  }
  const parsed = parseUnifiedDiff(raw);
  if (!parsed.length) {
    return false;
  }

  for (const f of parsed) {
    if (!f.path) {
      continue;
    }
    if (allowedPaths && !allowedPaths.has(f.path)) {
      continue;
    }
    const uri = vscode.Uri.joinPath(ws, f.path);
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const selected = allowedHunks?.get(f.path);
      const fileDiff =
        selected && selected.size ? { ...f, hunks: f.hunks.filter((_h, idx) => selected.has(idx)) } : f;
      if (!fileDiff.hunks.length) {
        continue;
      }
      const nextText = applyUnifiedDiffToText(doc.getText(), fileDiff);
      if (nextText === null) {
        continue;
      }
      const previewDoc = await vscode.workspace.openTextDocument({
        language: doc.languageId,
        content: nextText,
      });
      await vscode.commands.executeCommand(
        "vscode.diff",
        uri,
        previewDoc.uri,
        `Preview Apply: ${f.path}`
      );
      return true;
    } catch {
      // Try next file candidate.
    }
  }
  return false;
}

function buildApplyPreviewMarkdown(
  preview: ApplyPreview,
  selectedPaths: Set<string>,
  selectedHunks?: Map<string, Set<number>>
): string {
  const files = Array.from(selectedPaths);
  const lines: string[] = [];
  lines.push("## Apply Preview");
  lines.push(`- Kind: ${preview.kind}`);
  lines.push(`- Files selected: ${files.length}`);
  if (preview.kind === "diff") {
    let hunkCount = 0;
    for (const p of files) {
      hunkCount += selectedHunks?.get(p)?.size ?? 0;
    }
    lines.push(`- Hunks selected: ${hunkCount}`);
  }
  lines.push("");
  lines.push("### Files");
  for (const f of files.slice(0, 30)) {
    if (preview.kind === "diff") {
      const count = selectedHunks?.get(f)?.size ?? 0;
      lines.push(`- ${f} (${count} hunks)`);
    } else {
      lines.push(`- ${f}`);
    }
  }
  if (files.length > 30) {
    lines.push(`- ... +${files.length - 30} more`);
  }
  return lines.join("\n");
}

async function loadProjectPolicy(cfg: Config): Promise<PolicyConfig> {
  const ws = vscode.workspace.workspaceFolders?.[0]?.uri;
  const base = mergePolicyConfigs(parsePolicyConfig(undefined), { riskThreshold: cfg.policyRiskThreshold });
  if (!ws || !cfg.policyFile) {
    return base;
  }
  const seen = new Set<string>();
  const dec = new TextDecoder();

  const resolveOne = async (relPath: string): Promise<PolicyConfig> => {
    const safeRel = String(relPath || "").replace(/\\/g, "/").trim();
    if (!safeRel || safeRel.includes("..")) {
      return base;
    }
    if (seen.has(safeRel)) {
      return base;
    }
    seen.add(safeRel);
    const uri = vscode.Uri.joinPath(ws, safeRel);
    try {
      const raw = dec.decode(await vscode.workspace.fs.readFile(uri));
      const ext = parseExtendedPolicyFile(raw);
      let merged = mergePolicyConfigs(base, ext);

      const extendsList = Array.isArray(ext.extends)
        ? ext.extends
        : typeof ext.extends === "string" && ext.extends.trim()
          ? [ext.extends]
          : [];
      for (const child of extendsList) {
        const childCfg = await resolveOne(String(child || ""));
        merged = mergePolicyConfigs(childCfg, merged);
      }

      const importsList = Array.isArray(ext.imports)
        ? ext.imports
        : typeof ext.imports === "string" && ext.imports.trim()
          ? [ext.imports]
          : [];
      for (const imported of importsList) {
        const importedCfg = await resolveOne(String(imported || ""));
        merged = mergePolicyConfigs(importedCfg, merged);
      }

      const profile = (cfg.policyProfile || "balanced").trim().toLowerCase();
      if (ext.profiles && typeof ext.profiles === "object" && ext.profiles[profile]) {
        merged = mergePolicyConfigs(merged, ext.profiles[profile] || {});
      }

      merged.riskThreshold = cfg.policyRiskThreshold;
      return merged;
    } catch {
      return base;
    }
  };

  return resolveOne(cfg.policyFile);
}

function buildPolicyPreviewMarkdown(
  verdict: PolicyVerdict,
  opts?: { effectiveThreshold?: number; rollbackRatePct?: number; minTrustScore?: number; trustGate?: number }
): string {
  const threshold = Number.isFinite(Number(opts?.effectiveThreshold))
    ? Number(opts?.effectiveThreshold)
    : verdict.threshold;
  const lines: string[] = [];
  lines.push("### Policy Guardrail");
  lines.push(`- Risk: ${verdict.riskScore}/${threshold}`);
  lines.push(`- Blocked: ${verdict.blocked ? "yes" : "no"}`);
  lines.push(`- Override allowed: ${verdict.overrideAllowed ? "yes" : "no"}`);
  if (verdict.matchedDomains.length) {
    lines.push(`- Domains: ${verdict.matchedDomains.join(", ")}`);
  }
  if (Number.isFinite(Number(opts?.rollbackRatePct))) {
    lines.push(`- Rollback rate (history): ${Math.round(Number(opts?.rollbackRatePct))}%`);
  }
  if (Number.isFinite(Number(opts?.minTrustScore))) {
    lines.push(`- Min domain trust: ${Math.round(Number(opts?.minTrustScore))}/100`);
  }
  if (Number.isFinite(Number(opts?.trustGate))) {
    lines.push(`- Trust gate: >= ${Math.round(Number(opts?.trustGate))}`);
  }
  if (verdict.matchedForbidden.length) {
    lines.push("- Forbidden matches:");
    for (const p of verdict.matchedForbidden.slice(0, 10)) {
      lines.push(`  - ${p}`);
    }
  }
  if (verdict.reasons.length) {
    lines.push("- Reasons:");
    for (const r of verdict.reasons.slice(0, 8)) {
      lines.push(`  - ${r}`);
    }
  }
  if (verdict.blockedBy.length) {
    lines.push("- Blocked by:");
    for (const b of verdict.blockedBy.slice(0, 8)) {
      lines.push(`  - ${b}`);
    }
  }
  return lines.join("\n");
}

async function detectDefaultValidateCommand(): Promise<string> {
  const ws = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!ws) {
    return "yarn run check-types && yarn run lint";
  }
  const has = async (name: string): Promise<boolean> => {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.joinPath(ws, name));
      return true;
    } catch {
      return false;
    }
  };
  if (await has("pnpm-lock.yaml")) {
    return "pnpm run check-types && pnpm run lint";
  }
  if (await has("yarn.lock")) {
    return "yarn run check-types && yarn run lint";
  }
  if (await has("package-lock.json")) {
    return "npm run check-types && npm run lint";
  }
  return "yarn run check-types && yarn run lint";
}

function classifyErrorKind(message: string): ErrorKind {
  const m = String(message || "").toLowerCase();
  if (m.includes("timed out") || m.includes("timeout")) {
    return "timeout";
  }
  if (m.includes("401") || m.includes("403") || m.includes("unauthorized") || m.includes("forbidden")) {
    return "auth";
  }
  if (m.includes("429") || m.includes("rate limit")) {
    return "rate_limit";
  }
  if (m.includes("http 5")) {
    return "server";
  }
  if (m.includes("enotfound") || m.includes("econnrefused") || m.includes("network") || m.includes("socket")) {
    return "network";
  }
  return "other";
}

function shouldRetryWithFallback(kind: ErrorKind): boolean {
  return kind === "timeout" || kind === "network" || kind === "server";
}

function inferAutoModeAndAction(userText: string): { lane: AutoLane; mode: Mode; action: Action } {
  const t = String(userText || "").toLowerCase();
  let lane: AutoLane = "other";

  if (/\b(devops|infra|kubernetes|docker|helm|pipeline|ci\/cd|terraform|iac|ansible|deploy|powershell|runbook|sre)\b/.test(t)) {
    lane = "devops";
  } else if (/\b(pandas|sql|dataframe|dataset|eda|feature|treinar|train|modelo preditivo|machine learning|ml)\b/.test(t)) {
    lane = "ds";
  } else if (/\b(codigo|code|bug|refactor|typescript|javascript|node|api|backend|frontend|react|teste|test|funcao|classe)\b/.test(t)) {
    lane = "dev";
  }
  if (/\b(power bi|dax|power query|\bm\b|pbix|medida|relatorio)\b/.test(t)) {
    lane = "other";
  }

  const mode: Mode = lane === "dev" ? "code" : lane === "ds" ? "ds" : lane === "devops" ? "devops" : "devds";
  let action: Action = null;

  if (mode === "code") {
    if (/\b(security|seguranca|vulnerab|owasp)\b/.test(t)) {
      action = "security";
    } else if (/\b(review|code review|auditar|analisa|analisar riscos?)\b/.test(t)) {
      action = "review";
    } else if (/\b(fix|bug|erro|quebra|corrig|consert)\b/.test(t)) {
      action = "fix";
    } else if (/\b(test|teste|unit|integracao|coverage)\b/.test(t)) {
      action = "tests";
    } else if (/\b(refactor|refator|clean up|melhorar estrutura)\b/.test(t)) {
      action = "refactor";
    } else if (/\b(explain|explica|entender|como funciona)\b/.test(t)) {
      action = "explain";
    }
  } else if (mode === "ds") {
    if (/\b(sql|query|join|cte)\b/.test(t)) {
      action = "sql";
    } else if (/\b(eda|explorat|analise exploratoria)\b/.test(t)) {
      action = "eda";
    } else if (/\b(feature|variavel|engenharia de atributos)\b/.test(t)) {
      action = "features";
    } else if (/\b(train|trein|eval|avaliar|metric)\b/.test(t)) {
      action = "train_eval";
    } else if (/\b(debug|erro|falha|corrig)\b/.test(t)) {
      action = "debug";
    } else if (/\b(doc|documenta)\b/.test(t)) {
      action = "doc";
    }
  } else if (mode === "devops") {
    if (/\b(ci|cd|pipeline|github actions|gitlab ci|azure devops)\b/.test(t)) {
      action = "infra_ci";
    } else if (/\b(terraform|iac|bicep|cloudformation|pulumi)\b/.test(t)) {
      action = "infra_iac";
    } else if (/\b(observability|observab|prometheus|grafana|alerta|log)\b/.test(t)) {
      action = "infra_obs";
    } else if (/\b(secops|security|seguranca|hardening|vulnerab|siem)\b/.test(t)) {
      action = "infra_secops";
    } else if (/\b(runbook|procedimento|operacao|incidente)\b/.test(t)) {
      action = "infra_runbook";
    } else {
      action = "infra_ps";
    }
  } else {
    action = null;
  }

  return { lane, mode, action };
}

function estimateCloudCostBand(model: string): "low" | "medium" | "high" {
  const n = String(model || "").toLowerCase();
  const sizeMatch = n.match(/(\d+)\s*b/);
  const size = sizeMatch ? Number(sizeMatch[1]) || 0 : 0;
  if (size >= 70 || n.includes("120b") || n.includes("180b")) {
    return "high";
  }
  if (size >= 20) {
    return "medium";
  }
  return "low";
}

function isTestMode(): boolean {
  return process.env.OLLAMA_COPILOT_TEST_MODE === "1";
}

function isOllamaDotCom(baseUrl: string): boolean {
  try {
    const u = new URL(normalizeBaseUrl(baseUrl));
    return u.hostname === "ollama.com";
  } catch {
    return false;
  }
}

function isLocalEndpoint(baseUrl: string): boolean {
  try {
    const u = new URL(normalizeBaseUrl(baseUrl));
    const h = (u.hostname || "").toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
  } catch {
    return false;
  }
}

function fetchText(url: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error(`Invalid URL: ${url}`));
      return;
    }

    const lib = parsed.protocol === "https:" ? httpsRequest : httpRequest;
    const req = lib(
      buildRequestOptions(parsed, "GET", timeoutMs, {
        Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
      }),
      (res) => {
        const status = res.statusCode ?? 0;
        let data = "";
        res.on("data", (d) => {
          data += d.toString("utf8");
        });
        res.on("end", () => {
          if (status < 200 || status >= 300) {
            reject(new Error(`HTTP ${status} from ${parsed.pathname}`));
            return;
          }
          resolve(data);
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms.`));
    });
    req.end();
  });
}

async function fetchCloudModelsFromOfficialPages(timeoutMs: number, maxSources: number): Promise<string[]> {
  const cappedSources = Math.max(1, Math.min(3, maxSources));
  const cache = cloudCatalogCacheBySources.get(cappedSources) ?? new TimedValueCache<string[]>(CLOUD_CATALOG_TTL_MS);
  cloudCatalogCacheBySources.set(cappedSources, cache);
  const cached = cache.getFresh();
  if (cached && cached.length > 0) {
    return cached;
  }
  const inflight = cloudCatalogInflightBySources.get(cappedSources);
  if (inflight) {
    return inflight;
  }

  const sources = ["https://docs.ollama.com/cloud", "https://ollama.com/blog/cloud-models", "https://ollama.com/library"].slice(
    0,
    cappedSources
  );
  const promise = (async () => {
    const all = new Set<string>();

    for (const src of sources) {
      try {
        const text = await fetchText(src, timeoutMs);
        for (const m of parseCloudModels(text)) {
          all.add(m);
        }
      } catch {
        // best effort only
      }
    }

    const result = sortByModelQuality([...all]);
    if (result.length > 0) {
      cache.set(result);
    }
    return result;
  })();
  cloudCatalogInflightBySources.set(cappedSources, promise);

  try {
    return await promise;
  } finally {
    cloudCatalogInflightBySources.delete(cappedSources);
  }
}

async function safeLoadModels(
  cache: ModelCache,
  ollama: OllamaClient,
  keys: CloudKeyService,
  cfg: Config,
  endpoint: Endpoint,
  force = false
): Promise<string[]> {
  let models: string[] = [];
  try {
    const headers = await buildAuthHeaders(keys, cfg, endpoint);
    models = await cache.getModels(ollama, endpoint.baseUrl, cfg.timeoutMs, headers, force);
  } catch {
    models = [];
  }

  if (models.length > 0) {
    return models;
  }
  if (isOllamaDotCom(endpoint.baseUrl) && cfg.cloudCatalogFallbackEnabled) {
    return fetchCloudModelsFromOfficialPages(cfg.timeoutMs, cfg.cloudCatalogMaxSources);
  }
  return [];
}

function nextFromRanked(current: string, ranked: string[]): string | null {
  for (const m of ranked) {
    if (m !== current) {
      return m;
    }
  }
  return null;
}

function findLocalEndpoint(cfg: Config): Endpoint | undefined {
  return (
    cfg.endpoints.find((e) => e.id === "local") ??
    cfg.endpoints.find((e) => /localhost:11434/i.test(e.baseUrl)) ??
    cfg.endpoints.find((e) => /local/i.test(e.name))
  );
}

function findCloudEndpoint(cfg: Config): Endpoint | undefined {
  return (
    cfg.endpoints.find((e) => e.id === "cloud") ??
    cfg.endpoints.find((e) => /ollama\.com/i.test(e.baseUrl)) ??
    cfg.endpoints.find((e) => /cloud/i.test(e.name))
  );
}

/** ---------------- Config ---------------- */

class ConfigService {
  read(): Config {
    const c = vscode.workspace.getConfiguration("ollamaCopilot");
    const rawEndpoints = c.get<unknown[]>("endpoints", []);

    const endpoints: Endpoint[] = Array.isArray(rawEndpoints)
      ? rawEndpoints
          .map((e) => {
            const obj = e as Record<string, unknown>;
            const id = String(obj?.id ?? "").trim();
            const name = String(obj?.name ?? "").trim();
            const baseUrl = normalizeBaseUrl(String(obj?.baseUrl ?? ""));
            const defaultModel = String(obj?.defaultModel ?? "").trim();
            return { id, name, baseUrl, defaultModel };
          })
          .filter((e) => Boolean(e.id && e.name && e.baseUrl && e.defaultModel))
      : [];

    const fallback: Endpoint = {
      id: "local",
      name: "Local (Ollama)",
      baseUrl: "http://localhost:11434",
      defaultModel: "tinyllama:latest",
    };

    const safeEndpoints = endpoints.length ? endpoints : [fallback];

    const modeRaw = String(c.get("superChat.defaultMode", "devds")) as Mode;
    const ctxRaw = String(c.get("superChat.defaultContext", "workspace")) as ContextMode;
    const strategyRaw = String(c.get("modelStrategy", "best_local")) as ModelStrategy;

    const mode: Mode =
      modeRaw === "code" ||
      modeRaw === "ds" ||
      modeRaw === "devds" ||
      modeRaw === "infra" ||
      modeRaw === "devops" ||
      modeRaw === "pbi"
        ? modeRaw
        : "devds";
    const ctx: ContextMode =
      ctxRaw === "off" || ctxRaw === "selection" || ctxRaw === "file" || ctxRaw === "workspace" ? ctxRaw : "workspace";
    const modelStrategy: ModelStrategy =
      strategyRaw === "best_local" || strategyRaw === "user_selected" || strategyRaw === "fastest"
        ? strategyRaw
        : "best_local";

    return {
      endpoints: safeEndpoints,
      activeEndpointId: String(c.get("activeEndpointId", safeEndpoints[0].id)),
      lastModel: String(c.get("lastModel", "") || ""),
      maxContextChars: Number(c.get("maxContextChars", 12000)),
      maxContextTokens: Math.max(0, Number(c.get("maxContextTokens", 3000))),
      workspaceContextMaxFiles: clamp(Number(c.get("workspaceContextMaxFiles", 20)), 5, 80),
      workspaceContextCacheMs: clamp(Number(c.get("workspaceContextCacheMs", 8000)), 0, 120_000),
      validateCommand: String(c.get("validateCommand", "") || "").trim(),
      policyEnabled: Boolean(c.get("policyEnabled", true)),
      policyFile: String(c.get("policyFile", ".ollama_policies.json") || ".ollama_policies.json").trim(),
      policyProfile: String(c.get("policyProfile", "balanced") || "balanced").trim().toLowerCase(),
      policyRiskThreshold: Math.max(0, Number(c.get("policyRiskThreshold", 70))),
      policyDynamicThresholdEnabled: Boolean(c.get("policyDynamicThresholdEnabled", true)),
      policyRollbackPenaltyStartPct: clamp(Number(c.get("policyRollbackPenaltyStartPct", 20)), 0, 100),
      policyRollbackPenaltyMax: clamp(Number(c.get("policyRollbackPenaltyMax", 25)), 0, 90),
      policyRequireJustification: Boolean(c.get("policyRequireJustification", true)),
      policyDualApprovalEnabled: Boolean(c.get("policyDualApprovalEnabled", true)),
      policySecondApproverRequired: Boolean(c.get("policySecondApproverRequired", true)),
      policyTrustEnabled: Boolean(c.get("policyTrustEnabled", true)),
      policyTrustMinScoreAutoApply: clamp(Number(c.get("policyTrustMinScoreAutoApply", 70)), 0, 100),
      policyTrustLowScoreRiskPenalty: clamp(Number(c.get("policyTrustLowScoreRiskPenalty", 20)), 0, 80),
      policyCustodySigningEnabled: Boolean(c.get("policyCustodySigningEnabled", true)),
      policyGitProvenanceEnabled: Boolean(c.get("policyGitProvenanceEnabled", false)),
      policyGitCreateBranch: Boolean(c.get("policyGitCreateBranch", false)),
      policyGitCommitEnabled: Boolean(c.get("policyGitCommitEnabled", false)),
      policyGitCommitSignoff: Boolean(c.get("policyGitCommitSignoff", true)),
      policyGitCommitGpgSign: Boolean(c.get("policyGitCommitGpgSign", false)),
      policyGitBranchPrefix: String(c.get("policyGitBranchPrefix", "ollama/chain-") || "ollama/chain-").trim(),
      timeoutMs: Number(c.get("timeoutMs", 45000)),
      auditLogEnabled: Boolean(c.get("auditLogEnabled", true)),
      telemetryOptIn: Boolean(c.get("telemetry.optIn", false)),

      superChatDefaultMode: mode,
      superChatDefaultContext: ctx,
      superChatDefaultTemperature: clamp(Number(c.get("superChat.defaultTemperature", 0.3)), 0, 2),
      superChatHistoryMaxChars: Math.max(0, Number(c.get("superChat.historyMaxChars", 8000))),

      cloudApiKeySetting: String(c.get("cloud.apiKey", "") || ""),
      modelStrategy,
      cloudCatalogFallbackEnabled: Boolean(c.get("cloud.catalogFallbackEnabled", true)),
      cloudCatalogMaxSources: clamp(Number(c.get("cloud.catalogMaxSources", 3)), 1, 3),
    };
  }

  activeEndpoint(cfg: Config, requestedId?: string): Endpoint {
    const id = String(requestedId ?? cfg.activeEndpointId ?? "").trim();
    return cfg.endpoints.find((e) => e.id === id) ?? cfg.endpoints[0];
  }

  async setActiveEndpointId(id: string): Promise<void> {
    const cfg = vscode.workspace.getConfiguration("ollamaCopilot");
    await cfg.update("activeEndpointId", id, vscode.ConfigurationTarget.Global);
  }

  async setLastModel(model: string): Promise<void> {
    const cfg = vscode.workspace.getConfiguration("ollamaCopilot");
    await cfg.update("lastModel", model, vscode.ConfigurationTarget.Global);
  }

  async setModelStrategy(strategy: ModelStrategy): Promise<void> {
    const cfg = vscode.workspace.getConfiguration("ollamaCopilot");
    await cfg.update("modelStrategy", strategy, vscode.ConfigurationTarget.Global);
  }
}

/** ---------------- Secure Cloud Key ---------------- */

class CloudKeyService {
  private static SECRET_KEY = "ollamaCopilot.cloudApiKey";

  constructor(private context: vscode.ExtensionContext) {}

  async getCloudKey(cfg: Config): Promise<string> {
    const secret = (await this.context.secrets.get(CloudKeyService.SECRET_KEY)) || "";
    if (secret.trim()) {
      return secret.trim();
    }
    return (cfg.cloudApiKeySetting || "").trim();
  }

  async setCloudKey(value: string): Promise<void> {
    await this.context.secrets.store(CloudKeyService.SECRET_KEY, value.trim());
  }

  async clearCloudKey(): Promise<void> {
    await this.context.secrets.delete(CloudKeyService.SECRET_KEY);
  }
}

/** ---------------- Context ---------------- */

class ContextService {
  private workspaceCache: { key: string; at: number; text: string } | null = null;

  async get(
    flags: UIFlags,
    maxChars: number,
    maxTokens: number,
    workspaceMaxFiles: number,
    workspaceCacheMs: number,
    userText?: string
  ) {
    const editor = vscode.window.activeTextEditor;

    const selection = flags.useSelection && editor ? editor.document.getText(editor.selection) : "";
    const language = editor?.document.languageId ?? "";
    const fileName = editor?.document.fileName ?? "";

    let fileSnippet = "";
    if (flags.useFile && editor) {
      const pos = editor.selection.active;
      const start = Math.max(0, pos.line - 140);
      const end = Math.min(editor.document.lineCount - 1, pos.line + 140);
      const endLineLen = editor.document.lineAt(end).text.length;
      const range = new vscode.Range(new vscode.Position(start, 0), new vscode.Position(end, endLineLen));
      fileSnippet = editor.document.getText(range);
    }
    if (flags.useWorkspace) {
      fileSnippet = await this.getWorkspaceSnippet(editor, maxChars, maxTokens, workspaceMaxFiles, workspaceCacheMs, userText);
    }

    return {
      selection: trimContextByTokens(trimContext(selection, maxChars), maxTokens),
      fileSnippet: trimContextByTokens(trimContext(fileSnippet, maxChars), maxTokens),
      language,
      fileName,
    };
  }

  flagsFromContextMode(ctx: ContextMode): UIFlags {
    return {
      useFile: ctx === "file",
      useSelection: ctx === "selection",
      useWorkspace: ctx === "workspace",
    };
  }

  private async getWorkspaceSnippet(
    editor: vscode.TextEditor | undefined,
    maxChars: number,
    maxTokens: number,
    workspaceMaxFiles: number,
    workspaceCacheMs: number,
    userText?: string
  ): Promise<string> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) {
      return "";
    }

    const effectiveBudgetChars = Math.max(0, Math.min(maxChars, maxTokens > 0 ? maxTokens * 4 : maxChars));
    if (effectiveBudgetChars <= 0) {
      return "";
    }

    const activePath = editor?.document.uri.toString() ?? "none";
    const lineBucket = editor ? Math.floor(editor.selection.active.line / 40) : 0;
    const cacheKey = `${activePath}|${lineBucket}|${effectiveBudgetChars}|${workspaceMaxFiles}`;
    const now = Date.now();
    if (workspaceCacheMs > 0 && this.workspaceCache && this.workspaceCache.key === cacheKey && now - this.workspaceCache.at < workspaceCacheMs) {
      return this.workspaceCache.text;
    }

    const include = "**/*.{ts,tsx,js,jsx,mjs,cjs,json,md,py,java,cs,go,rs,php,rb,sql,yml,yaml,toml,ini,sh,ps1}";
    const exclude = "**/{node_modules,.git,dist,build,out,.next,coverage,.vscode-test,.yarn}/**";
    const found = await vscode.workspace.findFiles(include, exclude, 120);
    if (!found.length) {
      return "";
    }

    const activeUri = editor?.document.uri;
    const queryTerms = new Set(
      String(userText || "")
        .toLowerCase()
        .split(/[^a-z0-9_]+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 3)
    );
    const ordered = found
      .map((u) => {
        const rel = vscode.workspace.asRelativePath(u, false).toLowerCase();
        let score = 0;
        if (activeUri && u.toString() === activeUri.toString()) {
          score += 1000;
        }
        for (const t of queryTerms) {
          if (rel.includes(t)) {
            score += 10;
          }
        }
        return { u, rel, score };
      })
      .sort((a, b) => (b.score - a.score) || a.rel.localeCompare(b.rel))
      .map((x) => x.u);

    const parts: string[] = [];
    let usedChars = 0;
    const fileList = ordered.slice(0, 120).map((u) => vscode.workspace.asRelativePath(u, false));
    if (fileList.length) {
      const tree = `# Workspace files\n${fileList.map((p) => `- ${p}`).join("\n")}`;
      const fittedTree = tree.slice(0, effectiveBudgetChars);
      parts.push(fittedTree);
      usedChars += fittedTree.length;
    }
    const maxFiles = workspaceMaxFiles;
    const perFileBudget = Math.max(400, Math.floor(effectiveBudgetChars / 8));

    for (const uri of ordered) {
      if (parts.length >= maxFiles || usedChars >= effectiveBudgetChars) {
        break;
      }

      try {
        const doc = activeUri && uri.toString() === activeUri.toString() && editor ? editor.document : await vscode.workspace.openTextDocument(uri);
        const snippet = this.extractDocumentSnippet(doc, editor, uri, perFileBudget);
        if (!snippet) {
          continue;
        }

        const rel = vscode.workspace.asRelativePath(uri, false);
        const chunk = `\n\n# ${rel}\n${snippet}`;
        const remaining = effectiveBudgetChars - usedChars;
        if (remaining <= 0) {
          break;
        }
        const fitted = chunk.length <= remaining ? chunk : chunk.slice(0, remaining);
        parts.push(fitted);
        usedChars += fitted.length;
      } catch {
        // Skip unreadable file and continue collecting context from the workspace.
      }
    }

    const result = parts.join("").trim();
    if (workspaceCacheMs > 0) {
      this.workspaceCache = { key: cacheKey, at: now, text: result };
    }
    return result;
  }

  private extractDocumentSnippet(
    doc: vscode.TextDocument,
    editor: vscode.TextEditor | undefined,
    uri: vscode.Uri,
    perFileBudget: number
  ): string {
    if (doc.lineCount <= 0 || perFileBudget <= 0) {
      return "";
    }

    let snippet = "";
    const isActive = editor?.document.uri.toString() === uri.toString();
    if (isActive && editor) {
      const pos = editor.selection.active;
      const start = Math.max(0, pos.line - 80);
      const end = Math.min(doc.lineCount - 1, pos.line + 80);
      const endLineLen = doc.lineAt(end).text.length;
      const range = new vscode.Range(new vscode.Position(start, 0), new vscode.Position(end, endLineLen));
      snippet = doc.getText(range);
    } else {
      const end = Math.min(doc.lineCount - 1, 140);
      const endLineLen = doc.lineAt(end).text.length;
      const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(end, endLineLen));
      snippet = doc.getText(range);
    }

    return trimContext(snippet, perFileBudget);
  }
}

/** ---------------- Prompt Builder ---------------- */

class PromptBuilder {
  build(
    mode: Mode,
    action: Action,
    userText: string,
    ctx: { selection: string; fileSnippet: string; language: string }
  ): string {
    const hasContext = Boolean((ctx.selection || ctx.fileSnippet).trim());

    const codeCtx = [
      ctx.selection ? `Selected:\n${ctx.selection}` : "",
      ctx.fileSnippet ? `\nFile snippet:\n${ctx.fileSnippet}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    if (mode === "code") {
      const map: Record<string, string> = {
        explain: "Explain the code briefly and clearly.",
        refactor: "Refactor code. Keep behavior. Output ONLY final code.",
        tests: "Generate tests. Output ONLY test code.",
        fix: "Fix bugs/edge cases. Output ONLY corrected code.",
        review: "Concise code review: issues + improvements + risks.",
        security: "Security review: likely vulnerabilities + mitigations.",
      };
      const intent = action && map[action] ? map[action] : "Answer the user request.";
      const outputFormat =
        action === "review"
          ? [
              "Output format:",
              "## Findings",
              "- High:",
              "- Medium:",
              "- Low:",
              "## Risks",
              "## Next Steps",
            ].join("\n")
          : [
              "Output format:",
              "## Result",
              "## Changes",
              "## Validation",
            ].join("\n");

      return [
        "You are a senior software engineer. Be practical.",
        "Rules:",
        "- Be concise.",
        "- Start with solution/result, then essential details only.",
        "- For implementation/fix/refactor/tests: provide concrete patch-ready code and quick validation commands.",
        "- For multi-file changes, prefer unified diff or blocks in this format: 'File: path' + fenced code.",
        "- If you output code, prefer fenced blocks with file path labels.",
        "- If ambiguous, ask ONE short question.",
        "",
        ENGINEERING_RESPONSE_RUBRIC,
        "",
        `Language: ${ctx.language || "unknown"}`,
        "",
        `Task: ${intent}`,
        "",
        `User:\n${userText}`,
        "",
        hasContext ? codeCtx : "No code context provided.",
        outputFormat ? `\n${outputFormat}` : "",
      ].join("\n");
    }

    if (mode === "ds") {
      const map: Record<string, string> = {
        eda: "EDA plan: missing values, distributions, outliers, leakage risks. Include minimal pandas code if useful.",
        sql: "Translate between SQL and pandas; include both when relevant.",
        features: "Propose features/encodings and call out leakage pitfalls.",
        train_eval: "Training & evaluation plan with a minimal skeleton.",
        debug: "Debug data/ML issues: likely causes + fixes + minimal steps.",
        doc: "Write clear documentation/comments.",
      };
      const intent = action && map[action] ? map[action] : "Help with data science + engineering tasks.";

      return [
        "You are a senior Data Scientist + Software Engineer.",
        "Rules:",
        "- Be actionable and specific.",
        "- Prefer lightweight solutions suitable for limited hardware.",
        "",
        `Task: ${intent}`,
        "",
        `User:\n${userText}`,
        "",
        hasContext ? codeCtx : "No context provided. Ask for a small sample or select code.",
      ].join("\n");
    }

    if (mode === "devds") {
      const map: Record<string, string> = {
        explain: "Explain code and data pipeline behavior briefly and clearly.",
        refactor: "Refactor code safely (keep behavior). Output ONLY final code.",
        tests: "Generate practical tests for code and data transformations. Output ONLY test code.",
        fix: "Fix bugs/edge cases in app logic or data logic. Output ONLY corrected code.",
        review: "Technical review with findings first (severity: high/medium/low), then risks and improvements.",
        security: "Security + data governance review: vulnerabilities, leakage risks, and mitigations.",
        eda: "EDA plan focused on implementation impact. Include minimal Python code if useful.",
        sql: "Translate SQL <-> pandas and explain tradeoffs/performance briefly.",
        features: "Propose feature engineering with leakage prevention and implementation notes.",
        train_eval: "Training/evaluation plan with minimal reproducible skeleton.",
        debug: "Debug software/data/ML issues with likely causes and concrete next steps.",
        doc: "Write concise technical documentation for developers and data practitioners.",
      };
      const intent = action && map[action] ? map[action] : "Help with end-to-end Dev + Data Science implementation.";
      const outputFormat =
        action === "review"
          ? [
              "Output format:",
              "## Findings",
              "- High:",
              "- Medium:",
              "- Low:",
              "## Data Risks",
              "## Implementation Plan",
            ].join("\n")
          : [
              "Output format:",
              "## Result",
              "## Changes",
              "## Validation",
            ].join("\n");

      return [
        "You are a senior Software Engineer + Data Scientist.",
        "Rules:",
        "- Be practical and implementation-first.",
        "- Keep answers concise and actionable.",
        "- Call out assumptions and risks explicitly.",
        "",
        ENGINEERING_RESPONSE_RUBRIC,
        "",
        `Language: ${ctx.language || "unknown"}`,
        "",
        `Task: ${intent}`,
        "",
        `User:\n${userText}`,
        "",
        hasContext ? codeCtx : "No context provided. Ask for a small sample or relevant code section.",
        outputFormat ? `\n${outputFormat}` : "",
      ].join("\n");
    }

    if (mode === "infra" || mode === "devops") {
      const map: Record<string, string> = {
        infra_ps:
          "Infra troubleshooting with PowerShell commands. Provide step-by-step checks, expected output, and safe remediations.",
        infra_ci: "Design CI/CD pipeline checks and deployment flow. Include practical PowerShell snippets for Windows agents.",
        infra_iac: "Propose infrastructure as code structure and PowerShell operational scripts for provisioning/validation.",
        infra_obs: "Observability plan (logs/metrics/alerts) with PowerShell checks for service health and incident triage.",
        infra_secops: "Security hardening and SecOps checks with PowerShell commands and rollback-safe actions.",
        infra_runbook: "Create an operations runbook with PowerShell commands, decision points, and rollback procedure.",
        debug: "Debug infrastructure issues with concrete PowerShell-first diagnostics.",
        security: "Security review of infrastructure and operational scripts.",
        doc: "Write concise infrastructure documentation for operations handoff.",
      };
      const intent = action && map[action] ? map[action] : "Help with infrastructure operations using PowerShell-first guidance.";
      const outputFormat =
        action === "infra_ps" || action === "infra_runbook" || action === "infra_ci"
          ? [
              "Output format:",
              "## Diagnosis",
              "## PowerShell Commands",
              "## Verification",
              "## Rollback",
            ].join("\n")
          : "";

      return [
        "You are a senior Infrastructure Engineer (Windows-first) and SRE.",
        "Rules:",
        "- Prefer PowerShell commands for diagnostics and operations.",
        "- Default to safe, non-destructive commands first.",
        "- When suggesting risky actions, include rollback and verification steps.",
        "- Be concise and operationally practical.",
        "",
        `Task: ${intent}`,
        "",
        `User:\n${userText}`,
        "",
        hasContext ? codeCtx : "No context provided. Ask for environment details (OS, service, logs, deployment path).",
        outputFormat ? `\n${outputFormat}` : "",
      ].join("\n");
    }

    const map: Record<string, string> = {
      pbi_model: "Design a star schema (fact/dim), define grain, keys, relationships, and a date table plan.",
      pbi_m: "Write Power Query (M) steps/snippets to clean/shape the data.",
      pbi_dax: "Write 8–12 DAX measures with names + formulas for the goal.",
      pbi_visuals: "Recommend visuals/pages/filters/KPIs and layout for a dashboard.",
      pbi_checks: "Data quality checks, anomaly checks, and assumptions.",
    };

    const intent = action && map[action] ? map[action] : "Create a Power BI-ready plan (model + M + DAX + visuals).";

    return [
      "You are a senior Data Analyst and Power BI Developer.",
      "Rules:",
      "- Be structured and practical.",
      "- State assumptions clearly.",
      "",
      `Goal / Question:\n${userText}`,
      "",
      `Task:\n${intent}`,
      "",
      "Data sample / context:",
      hasContext ? codeCtx : "(No sample selected. Ask for a small table snippet.)",
      "",
      "Output format:",
      "## 1) Understanding",
      "## 2) Star Schema (Model)",
      "## 3) Power Query (M)",
      "## 4) DAX Measures",
      "## 5) Visuals & Layout",
      "## 6) Checks & Assumptions",
    ].join("\n");
  }
}

/** ---------------- Networking (Ollama JSONL stream) ---------------- */

function buildRequestOptions(
  url: URL,
  method: "GET" | "POST",
  timeoutMs: number,
  headers?: Record<string, string>
): RequestOptions {
  return {
    method,
    hostname: url.hostname,
    port: url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80,
    path: url.pathname + url.search,
    timeout: timeoutMs,
    headers: headers ?? {},
  };
}

class OllamaClient {
  async listModels(baseUrl: string, timeoutMs: number, headers?: Record<string, string>): Promise<string[]> {
    const url = new URL(normalizeBaseUrl(baseUrl) + "/api/tags");
    const json = (await this.fetchJson(url, timeoutMs, headers)) as TagsResponse | null;

    const models: string[] = Array.isArray(json?.models)
      ? json!.models.map((m) => String(m?.name ?? "").trim()).filter((name) => name.length > 0)
      : [];

    return sortByModelQuality([...new Set(models)]);
  }

  chatStream(opts: {
    baseUrl: string;
    body: unknown;
    timeoutMs: number;
    headers?: Record<string, string>;
    signal: AbortSignal;
    onToken: (t: string) => void;
    onError: (e: Error) => void;
    onDone: () => void;
  }): void {
    const url = new URL(normalizeBaseUrl(opts.baseUrl) + "/api/chat");
    const lib = url.protocol === "https:" ? httpsRequest : httpRequest;

    const req = lib(
      buildRequestOptions(url, "POST", opts.timeoutMs, { "Content-Type": "application/json", ...(opts.headers ?? {}) }),
      (res) => {
        const status = res.statusCode ?? 0;

        if (status < 200 || status >= 300) {
          let errBody = "";
          res.on("data", (d) => {
            errBody += d.toString("utf8");
          });
          res.on("end", () => {
            opts.onError(new Error(`HTTP ${status} from /api/chat: ${errBody.slice(0, 400)}`));
          });
          return;
        }

        let buf = "";
        res.on("data", (chunk: Buffer) => {
          buf += chunk.toString("utf8");
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) {
              continue;
            }
            const obj = safeJsonParse(line) as { message?: { content?: unknown } } | null;
            const token = obj?.message?.content;
            if (typeof token === "string" && token.length > 0) {
              opts.onToken(token);
            }
          }
        });

        res.on("end", () => {
          if (buf.trim()) {
            const obj = safeJsonParse(buf) as { message?: { content?: unknown } } | null;
            const token = obj?.message?.content;
            if (typeof token === "string" && token.length > 0) {
              opts.onToken(token);
            }
          }
          opts.onDone();
        });
      }
    );

    req.on("error", opts.onError);
    opts.signal.addEventListener("abort", () => {
      req.destroy(new Error("aborted"));
    });

    req.write(JSON.stringify(opts.body));
    req.end();
  }

  private fetchJson(url: URL, timeoutMs: number, headers?: Record<string, string>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const lib = url.protocol === "https:" ? httpsRequest : httpRequest;
      const req = lib(
        buildRequestOptions(url, "GET", timeoutMs, { Accept: "application/json", ...(headers ?? {}) }),
        (res) => {
          const status = res.statusCode ?? 0;
          let data = "";

          res.on("data", (d) => {
            data += d.toString("utf8");
          });

          res.on("end", () => {
            if (status < 200 || status >= 300) {
              reject(new Error(`HTTP ${status} from ${url.pathname}: ${data.slice(0, 400)}`));
              return;
            }
            const parsed = safeJsonParse(data);
            if (parsed === null) {
              reject(new Error("Invalid JSON from endpoint."));
              return;
            }
            resolve(parsed);
          });
        }
      );

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy(new Error(`Request timed out after ${timeoutMs}ms.`));
      });
      req.end();
    });
  }
}

/** ---------------- Model Cache ---------------- */

class ModelCache {
  private cache = new Map<string, { ts: number; models: string[] }>();

  async getModels(
    ollama: OllamaClient,
    baseUrl: string,
    timeoutMs: number,
    headers?: Record<string, string>,
    force = false
  ): Promise<string[]> {
    const key = normalizeBaseUrl(baseUrl);
    const now = Date.now();
    const cached = this.cache.get(key);

    if (!force && cached && now - cached.ts < 60_000) {
      return cached.models;
    }

    const models = await ollama.listModels(key, timeoutMs, headers);
    this.cache.set(key, { ts: now, models });
    return models;
  }
}

/** ---------------- Audit ---------------- */

class AuditLogger {
  private writeChain: Promise<void> = Promise.resolve();

  async append(lineObj: unknown): Promise<void> {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!ws) {
      return;
    }

    const file = vscode.Uri.joinPath(ws, ".ollama_copilot_log.jsonl");
    const line = Buffer.from(JSON.stringify(lineObj) + "\n", "utf8");

    this.writeChain = this.writeChain
      .catch(() => undefined)
      .then(async () => {
        try {
          const existing = await vscode.workspace.fs.readFile(file);
          const merged = new Uint8Array(existing.length + line.length);
          merged.set(existing, 0);
          merged.set(line, existing.length);
          await vscode.workspace.fs.writeFile(file, merged);
        } catch {
          await vscode.workspace.fs.writeFile(file, line);
        }
      });

    await this.writeChain;
  }
}

class TelemetryLogger {
  private writeChain: Promise<void> = Promise.resolve();

  async append(event: Record<string, unknown>, enabled: boolean): Promise<void> {
    if (!enabled) {
      return;
    }
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!ws) {
      return;
    }
    const file = vscode.Uri.joinPath(ws, ".ollama_copilot_telemetry.jsonl");
    const line = Buffer.from(JSON.stringify({ ts: new Date().toISOString(), ...event }) + "\n", "utf8");
    this.writeChain = this.writeChain
      .catch(() => undefined)
      .then(async () => {
        try {
          const existing = await vscode.workspace.fs.readFile(file);
          const merged = new Uint8Array(existing.length + line.length);
          merged.set(existing, 0);
          merged.set(line, existing.length);
          await vscode.workspace.fs.writeFile(file, merged);
        } catch {
          await vscode.workspace.fs.writeFile(file, line);
        }
      });

    await this.writeChain;
  }
}

type ModelPerfStats = { success: number; error: number; count: number; totalLatencyMs: number };

class ModelPerformanceService {
  private static KEY = "ollamaCopilot.modelPerf.v1";
  private data: Record<string, ModelPerfStats>;

  constructor(private context: vscode.ExtensionContext) {
    this.data = context.globalState.get<Record<string, ModelPerfStats>>(ModelPerformanceService.KEY, {});
  }

  private key(endpointId: string, model: string, mode?: Mode, action?: Action): string {
    const task = `${mode ?? "any"}:${action ?? "none"}`;
    return `${endpointId}::${model}::${task}`;
  }

  getBonus(endpointId: string, model: string, mode?: Mode, action?: Action): number {
    const row = this.data[this.key(endpointId, model, mode, action)];
    const globalRow = this.data[this.key(endpointId, model, "any" as Mode, null)];
    const source = row?.count ? row : globalRow;
    if (!source || source.count < 3) {
      return 0;
    }
    const successRate = source.success / Math.max(1, source.count);
    const avgLatencySec = source.totalLatencyMs / Math.max(1, source.success) / 1000;
    const errRate = source.error / Math.max(1, source.count);
    return successRate * 20 - avgLatencySec * 2 - errRate * 15;
  }

  rank(endpointId: string, models: string[], strategy: ModelStrategy, mode?: Mode, action?: Action): string[] {
    const ranked = rankModelsByStrategy(models, strategy);
    return [...ranked].sort((a, b) => {
      const diff = this.getBonus(endpointId, b, mode, action) - this.getBonus(endpointId, a, mode, action);
      if (diff !== 0) {
        return diff;
      }
      return 0;
    });
  }

  async recordSuccess(endpointId: string, model: string, latencyMs: number, mode?: Mode, action?: Action): Promise<void> {
    const k = this.key(endpointId, model, mode, action);
    const row = this.data[k] ?? { success: 0, error: 0, count: 0, totalLatencyMs: 0 };
    row.success += 1;
    row.count += 1;
    row.totalLatencyMs += Math.max(0, latencyMs);
    this.data[k] = row;
    // also update global aggregate for this model
    const gk = this.key(endpointId, model, "any" as Mode, null);
    const grow = this.data[gk] ?? { success: 0, error: 0, count: 0, totalLatencyMs: 0 };
    grow.success += 1;
    grow.count += 1;
    grow.totalLatencyMs += Math.max(0, latencyMs);
    this.data[gk] = grow;
    await this.context.globalState.update(ModelPerformanceService.KEY, this.data);
  }

  async recordError(endpointId: string, model: string, mode?: Mode, action?: Action): Promise<void> {
    const k = this.key(endpointId, model, mode, action);
    const row = this.data[k] ?? { success: 0, error: 0, count: 0, totalLatencyMs: 0 };
    row.error += 1;
    row.count += 1;
    this.data[k] = row;
    // also update global aggregate for this model
    const gk = this.key(endpointId, model, "any" as Mode, null);
    const grow = this.data[gk] ?? { success: 0, error: 0, count: 0, totalLatencyMs: 0 };
    grow.error += 1;
    grow.count += 1;
    this.data[gk] = grow;
    await this.context.globalState.update(ModelPerformanceService.KEY, this.data);
  }

  describeHealth(endpointId: string, model: string, mode?: Mode, action?: Action): string {
    const bonus = this.getBonus(endpointId, model, mode, action);
    if (bonus >= 12) {
      return `excellent (${bonus.toFixed(1)})`;
    }
    if (bonus >= 6) {
      return `good (${bonus.toFixed(1)})`;
    }
    if (bonus > 0) {
      return `fair (${bonus.toFixed(1)})`;
    }
    return "learning";
  }
}

class AdaptiveStrategyService {
  private static KEY = "ollamaCopilot.strategyAdaptive.v1";
  private readonly threshold = 3;
  private readonly cooldownMs = 10 * 60_000;
  private data: Record<string, { consecutiveFailures: number; degradedUntil?: number }>;

  constructor(private context: vscode.ExtensionContext) {
    this.data = context.globalState.get<Record<string, { consecutiveFailures: number; degradedUntil?: number }>>(
      AdaptiveStrategyService.KEY,
      {}
    );
  }

  private key(endpointId: string): string {
    return endpointId;
  }

  effective(endpointId: string, requested: ModelStrategy): ModelStrategy {
    if (requested !== "best_local") {
      return requested;
    }
    const row = this.data[this.key(endpointId)];
    if (!row?.degradedUntil) {
      return requested;
    }
    if (Date.now() >= row.degradedUntil) {
      return requested;
    }
    return "user_selected";
  }

  async onFailure(endpointId: string, requested: ModelStrategy): Promise<void> {
    if (requested !== "best_local") {
      return;
    }
    const k = this.key(endpointId);
    const row = this.data[k] ?? { consecutiveFailures: 0 };
    row.consecutiveFailures += 1;
    if (row.consecutiveFailures >= this.threshold) {
      row.degradedUntil = Date.now() + this.cooldownMs;
      row.consecutiveFailures = 0;
    }
    this.data[k] = row;
    await this.context.globalState.update(AdaptiveStrategyService.KEY, this.data);
  }

  async onSuccess(endpointId: string): Promise<void> {
    const k = this.key(endpointId);
    const row = this.data[k];
    if (!row) {
      return;
    }
    row.consecutiveFailures = 0;
    if (row.degradedUntil && Date.now() >= row.degradedUntil) {
      delete row.degradedUntil;
    }
    this.data[k] = row;
    await this.context.globalState.update(AdaptiveStrategyService.KEY, this.data);
  }
}

/** ---------------- Webview Provider (UI) ---------------- */

function post(view: vscode.WebviewView | undefined, msg: WebviewOut): void {
  void view?.webview.postMessage(msg);
}

class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "ollamaCopilot.chatView";

  private view?: vscode.WebviewView;
  private lastAnswer = "";
  private abortController: AbortController | null = null;
  private lastApplySnapshots: AppliedFileSnapshot[] = [];
  private applyChainWrite: Promise<void> = Promise.resolve();
  private pendingApplyGovernance:
    | {
        chainId: string;
        sourceHash: string;
        domains: string[];
        risk: number;
        threshold: number;
        overrideUsed: boolean;
        justification: string;
        actorId: string;
        approverId: string;
        minTrustScore: number;
      }
    | undefined;
  private lastAppliedChainId: string | undefined;

  private async readTelemetryStats(): Promise<{
    respCount: number;
    totalRespMs: number;
    applyOps: number;
    rollbackOps: number;
    validateOps: number;
    validateOk: number;
  }> {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!ws) {
      return { respCount: 0, totalRespMs: 0, applyOps: 0, rollbackOps: 0, validateOps: 0, validateOk: 0 };
    }
    const file = vscode.Uri.joinPath(ws, ".ollama_copilot_telemetry.jsonl");
    try {
      const bytes = await vscode.workspace.fs.readFile(file);
      const text = Buffer.from(bytes).toString("utf8");
      const lines = text.split(/\r?\n/).filter(Boolean).slice(-1200);
      let respCount = 0;
      let totalRespMs = 0;
      let applyOps = 0;
      let rollbackOps = 0;
      let validateOps = 0;
      let validateOk = 0;

      for (const line of lines) {
        let obj: Record<string, unknown> | null = null;
        try {
          obj = JSON.parse(line) as Record<string, unknown>;
        } catch {
          obj = null;
        }
        if (!obj) {
          continue;
        }
        const type = String(obj.type || "");
        if ((type === "chat_done" || type === "webview_done") && Number.isFinite(Number(obj.durationMs))) {
          respCount += 1;
          totalRespMs += Number(obj.durationMs);
        }
        if (type === "webview_apply_files") {
          applyOps += 1;
        }
        if (type === "webview_rollback_apply") {
          rollbackOps += 1;
        }
        if (type === "webview_apply_validate") {
          validateOps += 1;
          if (Boolean(obj.ok)) {
            validateOk += 1;
          }
        }
      }

      return { respCount, totalRespMs, applyOps, rollbackOps, validateOps, validateOk };
    } catch {
      return { respCount: 0, totalRespMs: 0, applyOps: 0, rollbackOps: 0, validateOps: 0, validateOk: 0 };
    }
  }

  private async appendApplyChain(event: Record<string, unknown>): Promise<void> {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!ws) {
      return;
    }
    const cfg = this.cfgSvc.read();
    const file = vscode.Uri.joinPath(ws, ".ollama_copilot_apply_chain.jsonl");
    this.applyChainWrite = this.applyChainWrite
      .catch(() => undefined)
      .then(async () => {
        let existingText = "";
        try {
          const existing = await vscode.workspace.fs.readFile(file);
          existingText = Buffer.from(existing).toString("utf8");
        } catch {
          existingText = "";
        }

        const ts = new Date().toISOString();
        const payload: Record<string, unknown> = { ts, ...event };
        let lineObj: Record<string, unknown> = payload;
        if (cfg.policyCustodySigningEnabled) {
          const hmacKey = await this.getOrCreateCustodyHmacKey();
          const prevHash = this.readLastEntryHash(existingText) || "GENESIS";
          const signed = buildCustodySignedEntry(payload, prevHash, hmacKey);
          lineObj = { ...payload, ...signed };
        }

        const line = Buffer.from(JSON.stringify(lineObj) + "\n", "utf8");
        const merged = Buffer.concat([Buffer.from(existingText, "utf8"), line]);
        await vscode.workspace.fs.writeFile(file, merged);
      });
    await this.applyChainWrite;
  }

  private readLastEntryHash(content: string): string | null {
    const lines = String(content || "").split(/\r?\n/).filter(Boolean);
    if (!lines.length) {
      return null;
    }
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      try {
        const row = JSON.parse(lines[i]) as Record<string, unknown>;
        const h = String(row.entryHash || "").trim();
        if (h) {
          return h;
        }
      } catch {
        // skip malformed line
      }
    }
    return null;
  }

  private async getOrCreateCustodyHmacKey(): Promise<string> {
    const keyName = "ollamaCopilot.custodyHmacKey";
    const existing = await this.context.secrets.get(keyName);
    if (existing && existing.trim()) {
      return existing.trim();
    }
    const generated = randomBytes(32).toString("hex");
    await this.context.secrets.store(keyName, generated);
    return generated;
  }

  private async verifyApplyChainIntegrity(): Promise<{ ok: boolean; checked: number; failedAt?: number; reason?: string }> {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!ws) {
      return { ok: true, checked: 0 };
    }
    const cfg = this.cfgSvc.read();
    const file = vscode.Uri.joinPath(ws, ".ollama_copilot_apply_chain.jsonl");
    try {
      const raw = await vscode.workspace.fs.readFile(file);
      const text = Buffer.from(raw).toString("utf8");
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (!cfg.policyCustodySigningEnabled) {
        return { ok: true, checked: lines.length };
      }
      const hmacKey = await this.getOrCreateCustodyHmacKey();
      let prevHash = "GENESIS";
      let checked = 0;
      for (const line of lines) {
        checked += 1;
        let row: Record<string, unknown>;
        try {
          row = JSON.parse(line) as Record<string, unknown>;
        } catch {
          return { ok: false, checked, failedAt: checked, reason: "invalid_json" };
        }
        const payload = { ...row };
        delete payload.prevHash;
        delete payload.payloadHash;
        delete payload.signature;
        delete payload.entryHash;
        const ok = verifyCustodySignedEntry(
          payload,
          {
            prevHash: String(row.prevHash || ""),
            payloadHash: String(row.payloadHash || ""),
            signature: String(row.signature || ""),
            entryHash: String(row.entryHash || ""),
          },
          prevHash,
          hmacKey
        );
        if (!ok) {
          return { ok: false, checked, failedAt: checked, reason: "signature_mismatch" };
        }
        prevHash = String(row.entryHash || "");
      }
      return { ok: true, checked };
    } catch {
      return { ok: true, checked: 0 };
    }
  }

  public async verifyCustodyTrailCommand(): Promise<void> {
    const result = await this.verifyApplyChainIntegrity();
    if (result.ok) {
      void vscode.window.showInformationMessage(`Custody trail verified (${result.checked} entries).`);
      return;
    }
    void vscode.window.showErrorMessage(
      `Custody trail verification failed at entry ${result.failedAt ?? "?"}: ${result.reason || "unknown"}`
    );
  }

  private async readDomainGovernanceStats(): Promise<
    Record<string, { samples: number; rollbackRatePct: number; validateSuccessRatePct: number }>
  > {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!ws) {
      return {};
    }
    const file = vscode.Uri.joinPath(ws, ".ollama_copilot_apply_chain.jsonl");
    try {
      const bytes = await vscode.workspace.fs.readFile(file);
      const text = Buffer.from(bytes).toString("utf8");
      const lines = text.split(/\r?\n/).filter(Boolean).slice(-2000);
      const chainDomains = new Map<string, string[]>();
      const chainApplied = new Set<string>();
      const chainRolledBack = new Set<string>();
      const chainValidated = new Map<string, boolean>();

      for (const line of lines) {
        let obj: Record<string, unknown> | null = null;
        try {
          obj = JSON.parse(line) as Record<string, unknown>;
        } catch {
          obj = null;
        }
        if (!obj) {
          continue;
        }
        const chainId = String(obj.chainId || "");
        if (!chainId) {
          continue;
        }
        const type = String(obj.type || "");
        const domains = Array.isArray(obj.domains) ? obj.domains.map((x) => String(x || "").trim()).filter(Boolean) : [];
        if (domains.length) {
          chainDomains.set(chainId, domains);
        }
        if (type === "apply_result" && Number(obj.appliedFiles || 0) > 0) {
          chainApplied.add(chainId);
        }
        if (type === "rollback_result" && Number(obj.rolledBackFiles || 0) > 0) {
          chainRolledBack.add(chainId);
        }
        if (type === "validate_result") {
          chainValidated.set(chainId, Boolean(obj.ok));
        }
      }

      const stats: Record<string, { samples: number; rollbacks: number; validateTotal: number; validateOk: number }> = {};
      for (const chainId of chainApplied) {
        const domains = chainDomains.get(chainId) || [];
        for (const d of domains) {
          if (!stats[d]) {
            stats[d] = { samples: 0, rollbacks: 0, validateTotal: 0, validateOk: 0 };
          }
          stats[d].samples += 1;
          if (chainRolledBack.has(chainId)) {
            stats[d].rollbacks += 1;
          }
          if (chainValidated.has(chainId)) {
            stats[d].validateTotal += 1;
            if (chainValidated.get(chainId)) {
              stats[d].validateOk += 1;
            }
          }
        }
      }

      const out: Record<string, { samples: number; rollbackRatePct: number; validateSuccessRatePct: number }> = {};
      for (const [domain, row] of Object.entries(stats)) {
        out[domain] = {
          samples: row.samples,
          rollbackRatePct: row.samples ? (row.rollbacks / row.samples) * 100 : 0,
          validateSuccessRatePct: row.validateTotal ? (row.validateOk / row.validateTotal) * 100 : 100,
        };
      }
      return out;
    } catch {
      return {};
    }
  }

  private async buildMetricsSummary(): Promise<string> {
    const stats = await this.readTelemetryStats();
    const avg = stats.respCount ? `${Math.round(stats.totalRespMs / stats.respCount)}ms` : "-";
    const validateRate = stats.validateOps ? `${Math.round((stats.validateOk / stats.validateOps) * 100)}%` : "-";
    const rollbackRate = stats.applyOps ? `${Math.round((stats.rollbackOps / stats.applyOps) * 100)}%` : "-";
    return `Perf | avg: ${avg} | validate: ${validateRate} | rollback: ${rollbackRate}`;
  }

  private async buildDomainHeatmapData(): Promise<{
    markdown: string;
    rows: Array<{ domain: string; rollbackRate: number; validateRate: number; blockRate: number; overrideRate: number; topRule: string }>;
  }> {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!ws) {
      return { markdown: "Heatmap | no workspace", rows: [] };
    }
    const file = vscode.Uri.joinPath(ws, ".ollama_copilot_apply_chain.jsonl");
    try {
      const bytes = await vscode.workspace.fs.readFile(file);
      const text = Buffer.from(bytes).toString("utf8");
      const lines = text.split(/\r?\n/).filter(Boolean).slice(-2000);
      const byDomain: Record<string, { attempts: number; blocked: number; overrides: number; applied: number; rolledBack: number; validated: number; validatedOk: number; rules: Record<string, number> }> = {};
      const chainDomains = new Map<string, string[]>();
      const chainApplied = new Set<string>();
      const chainRolledBack = new Set<string>();
      const chainValidated = new Map<string, boolean>();

      const ensure = (domain: string) => {
        if (!byDomain[domain]) {
          byDomain[domain] = {
            attempts: 0,
            blocked: 0,
            overrides: 0,
            applied: 0,
            rolledBack: 0,
            validated: 0,
            validatedOk: 0,
            rules: {},
          };
        }
        return byDomain[domain];
      };

      for (const line of lines) {
        let obj: Record<string, unknown> | null = null;
        try {
          obj = JSON.parse(line) as Record<string, unknown>;
        } catch {
          obj = null;
        }
        if (!obj) {
          continue;
        }
        const chainId = String(obj.chainId || "");
        if (!chainId) {
          continue;
        }
        const domains = Array.isArray(obj.domains) ? obj.domains.map((x) => String(x || "").trim()).filter(Boolean) : [];
        if (domains.length) {
          chainDomains.set(chainId, domains);
        }
        const type = String(obj.type || "");
        if (type === "policy_verdict") {
          for (const d of domains) {
            const row = ensure(d);
            row.attempts += 1;
            if (Boolean(obj.blocked)) {
              row.blocked += 1;
            }
            if (Boolean(obj.overrideUsed)) {
              row.overrides += 1;
            }
            const blockedBy = Array.isArray(obj.blockedBy)
              ? obj.blockedBy.map((x) => String(x || "").trim()).filter(Boolean)
              : [];
            for (const b of blockedBy.slice(0, 4)) {
              row.rules[b] = (row.rules[b] || 0) + 1;
            }
          }
          continue;
        }
        if (type === "apply_result" && Number(obj.appliedFiles || 0) > 0) {
          chainApplied.add(chainId);
          continue;
        }
        if (type === "rollback_result" && Number(obj.rolledBackFiles || 0) > 0) {
          chainRolledBack.add(chainId);
          continue;
        }
        if (type === "validate_result") {
          chainValidated.set(chainId, Boolean(obj.ok));
        }
      }

      for (const chainId of chainApplied) {
        for (const d of chainDomains.get(chainId) || []) {
          ensure(d).applied += 1;
        }
      }
      for (const chainId of chainRolledBack) {
        for (const d of chainDomains.get(chainId) || []) {
          ensure(d).rolledBack += 1;
        }
      }
      for (const [chainId, ok] of chainValidated.entries()) {
        for (const d of chainDomains.get(chainId) || []) {
          const row = ensure(d);
          row.validated += 1;
          if (ok) {
            row.validatedOk += 1;
          }
        }
      }

      const domains = Object.keys(byDomain).sort((a, b) => a.localeCompare(b)).slice(0, 8);
      if (!domains.length) {
        return { markdown: "Heatmap | no domain data yet", rows: [] };
      }
      const linesOut: string[] = [];
      const rows: Array<{ domain: string; rollbackRate: number; validateRate: number; blockRate: number; overrideRate: number; topRule: string }> = [];
      linesOut.push("Heatmap | domain governance");
      for (const d of domains) {
        const r = byDomain[d];
        const rollbackRate = r.applied ? Math.round((r.rolledBack / r.applied) * 100) : 0;
        const validateRate = r.validated ? Math.round((r.validatedOk / r.validated) * 100) : 0;
        const blockRate = r.attempts ? Math.round((r.blocked / r.attempts) * 100) : 0;
        const overrideRate = r.attempts ? Math.round((r.overrides / r.attempts) * 100) : 0;
        const topRule = Object.entries(r.rules).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";
        rows.push({ domain: d, rollbackRate, validateRate, blockRate, overrideRate, topRule });
        linesOut.push(
          `${d}: rb ${rollbackRate}% | val ${validateRate}% | blk ${blockRate}% | ov ${overrideRate}% | top ${topRule}`
        );
      }
      return { markdown: linesOut.join("\n"), rows };
    } catch {
      return { markdown: "Heatmap | unavailable", rows: [] };
    }
  }

  private async publishMetrics(): Promise<void> {
    const summary = await this.buildMetricsSummary();
    post(this.view, { type: "metrics", summary });
    const heatmap = await this.buildDomainHeatmapData();
    post(this.view, { type: "heatmap", markdown: heatmap.markdown });
    post(this.view, { type: "heatmapRows", rows: heatmap.rows });
  }

  private async postApplySummary(appliedFiles: number): Promise<void> {
    const pick = await vscode.window.showInformationMessage(
      `Applied ${appliedFiles} file(s).`,
      "Review Changes",
      "Undo Apply",
      "OK"
    );
    if (pick === "Review Changes") {
      await vscode.commands.executeCommand("workbench.view.scm");
      return;
    }
    if (pick === "Undo Apply") {
      const rolledBack = await rollbackWorkspaceApply(this.lastApplySnapshots);
      if (rolledBack > 0) {
        await this.appendApplyChain({
          type: "rollback_result",
          chainId: this.lastAppliedChainId || randomUUID(),
          rolledBackFiles: rolledBack,
        });
        this.lastApplySnapshots = [];
        void vscode.window.showInformationMessage(`Rollback completed for ${rolledBack} file(s).`);
      } else {
        void vscode.window.showInformationMessage("No apply snapshot available for rollback.");
      }
    }
  }

  private resolveApplyTargets(
    source: string,
    selectedPaths?: Set<string>
  ): { preview: ApplyPreview | null; paths: string[]; patchLinesByPath: Record<string, number> } {
    const patchLinesByPath: Record<string, number> = {};
    const preview = buildApplyPreview(source);
    if (preview) {
      const base = selectedPaths ? Array.from(selectedPaths) : preview.files;
      if (preview.kind === "diff") {
        const diffs = parseUnifiedDiff(source);
        for (const f of diffs) {
          if (!f.path) {
            continue;
          }
          let lines = 0;
          for (const h of f.hunks) {
            for (const l of h.lines) {
              if (l.startsWith("+") || l.startsWith("-")) {
                lines += 1;
              }
            }
          }
          patchLinesByPath[f.path] = lines;
        }
      } else {
        const blocks = parseWorkspaceFileBlocks(source);
        for (const b of blocks) {
          patchLinesByPath[b.path] = String(b.content || "").split(/\r?\n/).length;
        }
      }
      return { preview, paths: base, patchLinesByPath };
    }
    const blocks = parseWorkspaceFileBlocks(source);
    const blockPaths = blocks.map((b) => b.path);
    const paths = selectedPaths ? blockPaths.filter((p) => selectedPaths.has(p)) : blockPaths;
    for (const b of blocks) {
      patchLinesByPath[b.path] = String(b.content || "").split(/\r?\n/).length;
    }
    return { preview: null, paths, patchLinesByPath };
  }

  private async enforcePolicyBeforeApply(source: string, selectedPaths?: Set<string>): Promise<boolean> {
    const cfg = this.cfgSvc.read();
    if (!cfg.policyEnabled) {
      this.pendingApplyGovernance = undefined;
      return true;
    }

    const { paths, patchLinesByPath } = this.resolveApplyTargets(source, selectedPaths);
    if (!paths.length) {
      this.pendingApplyGovernance = undefined;
      return true;
    }
    const policy = await loadProjectPolicy(cfg);
    const domainMetrics = await this.readDomainGovernanceStats();
    const verdict = evaluatePolicy(paths, policy, { patchLinesByPath, domainMetrics });
    const trustByDomain = computeTrustByDomain(domainMetrics);
    const minTrustScore = minTrustForDomains(verdict.matchedDomains, trustByDomain);
    if (cfg.policyTrustEnabled && verdict.matchedDomains.length && minTrustScore < cfg.policyTrustMinScoreAutoApply) {
      verdict.riskScore += cfg.policyTrustLowScoreRiskPenalty;
      verdict.reasons.push(
        `Low trust domains (${Math.round(minTrustScore)}/100) added +${cfg.policyTrustLowScoreRiskPenalty} risk`
      );
    }
    const stats = await this.readTelemetryStats();
    const rollbackRatePct = stats.applyOps ? (stats.rollbackOps / stats.applyOps) * 100 : 0;
    let effectiveThreshold = verdict.threshold;
    if (cfg.policyDynamicThresholdEnabled && rollbackRatePct >= cfg.policyRollbackPenaltyStartPct) {
      const denom = Math.max(1, 100 - cfg.policyRollbackPenaltyStartPct);
      const ratio = Math.min(1, (rollbackRatePct - cfg.policyRollbackPenaltyStartPct) / denom);
      const penalty = Math.round(cfg.policyRollbackPenaltyMax * ratio);
      effectiveThreshold = Math.max(10, verdict.threshold - penalty);
      verdict.reasons.push(
        `Dynamic threshold active due rollback rate ${Math.round(rollbackRatePct)}% (-${penalty} threshold)`
      );
    }
    post(
      this.view,
      {
        type: "applyPreview",
        markdown: buildPolicyPreviewMarkdown(verdict, {
          effectiveThreshold,
          rollbackRatePct,
          minTrustScore,
          trustGate: cfg.policyTrustEnabled ? cfg.policyTrustMinScoreAutoApply : undefined,
        }),
      }
    );
    const sourceHash = createHash("sha256").update(source || "").digest("hex").slice(0, 16);
    const chainId = randomUUID();

    if (verdict.blocked) {
      await this.appendApplyChain({
        type: "policy_verdict",
        chainId,
        sourceHash,
        blocked: true,
        risk: verdict.riskScore,
        threshold: effectiveThreshold,
        domains: verdict.matchedDomains,
        minTrustScore,
        blockedBy: verdict.blockedBy,
        reasons: verdict.reasons,
      });
      await this.telemetry.append(
        {
          type: "webview_policy_blocked",
          files: paths.length,
          risk: verdict.riskScore,
          threshold: effectiveThreshold,
          domains: verdict.matchedDomains.join(","),
          minTrustScore,
          reasons: verdict.reasons.slice(0, 6).join(" | "),
        },
        cfg.telemetryOptIn
      );
      void vscode.window.showErrorMessage(
        `Apply blocked by policy. Risk ${verdict.riskScore}/${effectiveThreshold}.`
      );
      return false;
    }

    if (verdict.riskScore >= effectiveThreshold) {
      if (!verdict.overrideAllowed) {
        await this.appendApplyChain({
          type: "policy_verdict",
          chainId,
          sourceHash,
          blocked: true,
          risk: verdict.riskScore,
          threshold: effectiveThreshold,
          domains: verdict.matchedDomains,
          minTrustScore,
          blockedBy: ["override_disabled_by_domain"],
          reasons: verdict.reasons,
        });
        await this.telemetry.append(
          {
            type: "webview_policy_blocked",
            files: paths.length,
            risk: verdict.riskScore,
            threshold: effectiveThreshold,
            domains: verdict.matchedDomains.join(","),
            minTrustScore,
            reasons: "override_disabled_by_domain",
          },
          cfg.telemetryOptIn
        );
        void vscode.window.showErrorMessage("Apply blocked: override disabled for matched domain policy.");
        return false;
      }
      const choice = await vscode.window.showWarningMessage(
        `High-risk apply (${verdict.riskScore}/${effectiveThreshold}). Continue?`,
        { modal: true },
        "Apply Anyway",
        "Cancel"
      );
      if (choice !== "Apply Anyway") {
        await this.telemetry.append(
          {
            type: "webview_policy_canceled",
            files: paths.length,
            risk: verdict.riskScore,
            threshold: effectiveThreshold,
            domains: verdict.matchedDomains.join(","),
            minTrustScore,
          },
          cfg.telemetryOptIn
        );
        await this.appendApplyChain({
          type: "policy_verdict",
          chainId,
          sourceHash,
          blocked: false,
          canceled: true,
          risk: verdict.riskScore,
          threshold: effectiveThreshold,
          domains: verdict.matchedDomains,
          minTrustScore,
          reasons: verdict.reasons,
        });
        void vscode.window.showInformationMessage("Apply canceled by policy threshold.");
        return false;
      }

      let justification = "";
      if (cfg.policyRequireJustification) {
        const input = await vscode.window.showInputBox({
          title: "Policy Override Justification",
          prompt: "Short reason for audit (required to continue apply).",
          ignoreFocusOut: true,
          value: "",
        });
        justification = String(input || "").trim();
        if (!justification) {
          await this.telemetry.append(
            {
              type: "webview_policy_canceled",
              files: paths.length,
              risk: verdict.riskScore,
              threshold: effectiveThreshold,
              reason: "missing_justification",
              domains: verdict.matchedDomains.join(","),
              minTrustScore,
            },
            cfg.telemetryOptIn
          );
          await this.appendApplyChain({
            type: "policy_verdict",
            chainId,
            sourceHash,
            blocked: false,
            canceled: true,
            risk: verdict.riskScore,
            threshold: effectiveThreshold,
            domains: verdict.matchedDomains,
            minTrustScore,
            reasons: [...verdict.reasons, "missing_justification"],
          });
          void vscode.window.showInformationMessage("Apply canceled: override justification is required.");
          return false;
        }
      }
      let actorId = "";
      let approverId = "";
      if (cfg.policyDualApprovalEnabled) {
        const actorInput = await vscode.window.showInputBox({
          title: "Override Actor",
          prompt: "Enter your identifier (user/email) for audit.",
          ignoreFocusOut: true,
          value: "",
        });
        actorId = String(actorInput || "").trim();
        if (!actorId) {
          await this.telemetry.append(
            {
              type: "webview_policy_canceled",
              files: paths.length,
              risk: verdict.riskScore,
              threshold: effectiveThreshold,
              reason: "missing_actor",
              domains: verdict.matchedDomains.join(","),
              minTrustScore,
            },
            cfg.telemetryOptIn
          );
          void vscode.window.showInformationMessage("Apply canceled: actor ID is required.");
          return false;
        }
        if (cfg.policySecondApproverRequired) {
          const approverInput = await vscode.window.showInputBox({
            title: "Second Approver",
            prompt: "Enter second approver identifier.",
            ignoreFocusOut: true,
            value: "",
          });
          approverId = String(approverInput || "").trim();
          if (!approverId || approverId.toLowerCase() === actorId.toLowerCase()) {
            await this.telemetry.append(
              {
                type: "webview_policy_canceled",
                files: paths.length,
                risk: verdict.riskScore,
                threshold: effectiveThreshold,
                reason: "invalid_second_approver",
                domains: verdict.matchedDomains.join(","),
                minTrustScore,
              },
              cfg.telemetryOptIn
            );
            void vscode.window.showInformationMessage("Apply canceled: second approver must be different.");
            return false;
          }
          const confirmCode = chainId.slice(0, 6).toUpperCase();
          const confirm = await vscode.window.showInputBox({
            title: "Second Approval Confirmation",
            prompt: `Type approval code ${confirmCode} to confirm dual approval.`,
            ignoreFocusOut: true,
            value: "",
          });
          if (String(confirm || "").trim().toUpperCase() !== confirmCode) {
            await this.telemetry.append(
              {
                type: "webview_policy_canceled",
                files: paths.length,
                risk: verdict.riskScore,
                threshold: effectiveThreshold,
                reason: "second_approval_code_invalid",
                domains: verdict.matchedDomains.join(","),
                minTrustScore,
              },
              cfg.telemetryOptIn
            );
            void vscode.window.showInformationMessage("Apply canceled: second approval code mismatch.");
            return false;
          }
        }
      }

      await this.telemetry.append(
        {
          type: "webview_policy_override",
          files: paths.length,
          risk: verdict.riskScore,
          threshold: effectiveThreshold,
          domains: verdict.matchedDomains.join(","),
          justification,
          actorId,
          approverId,
          minTrustScore,
        },
        cfg.telemetryOptIn
      );
      this.pendingApplyGovernance = {
        chainId,
        sourceHash,
        domains: verdict.matchedDomains,
        risk: verdict.riskScore,
        threshold: effectiveThreshold,
        overrideUsed: true,
        justification,
        actorId,
        approverId,
        minTrustScore,
      };
      await this.appendApplyChain({
        type: "policy_verdict",
        chainId,
        sourceHash,
        blocked: false,
        canceled: false,
        risk: verdict.riskScore,
        threshold: effectiveThreshold,
        overrideUsed: true,
        justification,
        actorId,
        approverId,
        minTrustScore,
        domains: verdict.matchedDomains,
        reasons: verdict.reasons,
      });
      return true;
    }

    if (cfg.policyTrustEnabled && verdict.matchedDomains.length && minTrustScore < cfg.policyTrustMinScoreAutoApply) {
      const proceed = await vscode.window.showWarningMessage(
        `Low trust score (${Math.round(minTrustScore)}/100) for domains [${verdict.matchedDomains.join(", ")}]. Continue apply?`,
        { modal: true },
        "Continue",
        "Cancel"
      );
      if (proceed !== "Continue") {
        await this.telemetry.append(
          {
            type: "webview_policy_canceled",
            files: paths.length,
            risk: verdict.riskScore,
            threshold: effectiveThreshold,
            domains: verdict.matchedDomains.join(","),
            reason: "trust_gate",
            minTrustScore,
          },
          cfg.telemetryOptIn
        );
        await this.appendApplyChain({
          type: "policy_verdict",
          chainId,
          sourceHash,
          blocked: false,
          canceled: true,
          risk: verdict.riskScore,
          threshold: effectiveThreshold,
          minTrustScore,
          domains: verdict.matchedDomains,
          reasons: [...verdict.reasons, "trust_gate"],
        });
        return false;
      }
    }

    this.pendingApplyGovernance = {
      chainId,
      sourceHash,
      domains: verdict.matchedDomains,
      risk: verdict.riskScore,
      threshold: effectiveThreshold,
      overrideUsed: false,
      justification: "",
      actorId: "",
      approverId: "",
      minTrustScore,
    };
    await this.appendApplyChain({
      type: "policy_verdict",
      chainId,
      sourceHash,
      blocked: false,
      canceled: false,
      risk: verdict.riskScore,
      threshold: effectiveThreshold,
      minTrustScore,
      overrideUsed: false,
      domains: verdict.matchedDomains,
      reasons: verdict.reasons,
    });
    return true;
  }

  private async applySource(source: string): Promise<number> {
    let selectedPaths: Set<string> | undefined;
    let selectedHunks: Map<string, Set<number>> | undefined;
    const preview = buildApplyPreview(source);
    if (preview) {
      const picked = await pickWorkspaceApplyFiles(preview);
      if (!picked) {
        void vscode.window.showInformationMessage("Apply canceled.");
        return 0;
      }
      selectedPaths = picked;
      if (preview.kind === "diff") {
        const hunks = await pickWorkspaceApplyHunks(preview, picked);
        if (!hunks || !hunks.size) {
          void vscode.window.showInformationMessage("Apply canceled.");
          return 0;
        }
        selectedHunks = hunks;
        post(this.view, { type: "applyPreview", markdown: buildApplyPreviewMarkdown(preview, picked, hunks) });
        const opened = await previewWorkspaceDiff(source, selectedPaths, selectedHunks);
        if (opened) {
          const proceed = await vscode.window.showWarningMessage(
            "Diff preview opened. Apply selected hunks now?",
            { modal: true },
            "Apply",
            "Cancel"
          );
          if (proceed !== "Apply") {
            void vscode.window.showInformationMessage("Apply canceled.");
            return 0;
          }
        }
      } else {
        post(this.view, { type: "applyPreview", markdown: buildApplyPreviewMarkdown(preview, picked) });
      }
    }

    const allowed = await this.enforcePolicyBeforeApply(source, selectedPaths);
    if (!allowed) {
      return 0;
    }

    const diffResult = await tryApplyWorkspaceDiff(source, selectedPaths, selectedHunks);
    if (diffResult.appliedFiles > 0) {
      this.lastApplySnapshots = diffResult.snapshots;
      const governance = this.pendingApplyGovernance;
      this.lastAppliedChainId = governance?.chainId;
      await this.appendApplyChain({
        type: "apply_result",
        chainId: governance?.chainId || randomUUID(),
        sourceHash: governance?.sourceHash || createHash("sha256").update(source || "").digest("hex").slice(0, 16),
        appliedFiles: diffResult.appliedFiles,
        overrideUsed: governance?.overrideUsed || false,
        justification: governance?.justification || "",
        actorId: governance?.actorId || "",
        approverId: governance?.approverId || "",
        minTrustScore: governance?.minTrustScore ?? -1,
        risk: governance?.risk ?? -1,
        threshold: governance?.threshold ?? -1,
        domains: governance?.domains || [],
      });
      await this.runGitProvenance(governance, diffResult.appliedFiles);
      this.pendingApplyGovernance = undefined;
      await this.postApplySummary(diffResult.appliedFiles);
      return diffResult.appliedFiles;
    }

    const fileBlocks = await tryApplyWorkspaceFileBlocks(source, selectedPaths);
    if (fileBlocks.appliedFiles > 0) {
      this.lastApplySnapshots = fileBlocks.snapshots;
      const governance = this.pendingApplyGovernance;
      this.lastAppliedChainId = governance?.chainId;
      await this.appendApplyChain({
        type: "apply_result",
        chainId: governance?.chainId || randomUUID(),
        sourceHash: governance?.sourceHash || createHash("sha256").update(source || "").digest("hex").slice(0, 16),
        appliedFiles: fileBlocks.appliedFiles,
        overrideUsed: governance?.overrideUsed || false,
        justification: governance?.justification || "",
        actorId: governance?.actorId || "",
        approverId: governance?.approverId || "",
        minTrustScore: governance?.minTrustScore ?? -1,
        risk: governance?.risk ?? -1,
        threshold: governance?.threshold ?? -1,
        domains: governance?.domains || [],
      });
      await this.runGitProvenance(governance, fileBlocks.appliedFiles);
      this.pendingApplyGovernance = undefined;
      await this.postApplySummary(fileBlocks.appliedFiles);
      return fileBlocks.appliedFiles;
    }

    this.lastApplySnapshots = [];
    this.pendingApplyGovernance = undefined;
    return 0;
  }

  private sanitizeBranchName(raw: string): string {
    const safe = String(raw || "").replace(/[^a-zA-Z0-9/_-]/g, "");
    return safe || "ollama/chain-";
  }

  private async runGitProvenance(
    governance:
      | {
          chainId: string;
          sourceHash: string;
          domains: string[];
          risk: number;
          threshold: number;
          overrideUsed: boolean;
          justification: string;
          actorId: string;
          approverId: string;
          minTrustScore: number;
        }
      | undefined,
    appliedFiles: number
  ): Promise<void> {
    const cfg = this.cfgSvc.read();
    if (!cfg.policyGitProvenanceEnabled) {
      return;
    }
    const wsPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!wsPath) {
      return;
    }
    const chainId = governance?.chainId || randomUUID();
    const sourceHash = governance?.sourceHash || "unknown";
    const branchPrefix = this.sanitizeBranchName(cfg.policyGitBranchPrefix);
    const branchName = `${branchPrefix}${chainId}`;
    try {
      await execAsync("git rev-parse --is-inside-work-tree", { cwd: wsPath, timeout: 20_000 });
    } catch {
      await this.appendApplyChain({
        type: "git_provenance",
        chainId,
        ok: false,
        reason: "not_git_repo",
      });
      return;
    }

    try {
      if (cfg.policyGitCreateBranch) {
        await execAsync(`git checkout -B "${branchName}"`, { cwd: wsPath, timeout: 30_000 });
      }
      if (cfg.policyGitCommitEnabled) {
        await execAsync("git add -A", { cwd: wsPath, timeout: 30_000 });
        const suffixSignoff = cfg.policyGitCommitSignoff ? " --signoff" : "";
        const suffixGpg = cfg.policyGitCommitGpgSign ? " -S" : "";
        const msg = `OllamaCopilot: apply chainId=${chainId} sourceHash=${sourceHash}`;
        try {
          await execAsync(`git commit -m "${msg.replace(/"/g, "'")}"${suffixSignoff}${suffixGpg}`, {
            cwd: wsPath,
            timeout: 45_000,
          });
        } catch (e: unknown) {
          const anyErr = e as { stdout?: string; stderr?: string; message?: string };
          const blob = `${anyErr?.stdout || ""}\n${anyErr?.stderr || ""}\n${anyErr?.message || ""}`;
          if (!/nothing to commit/i.test(blob)) {
            throw e;
          }
        }
      }

      let head = "";
      try {
        const out = await execAsync("git rev-parse --short HEAD", { cwd: wsPath, timeout: 20_000 });
        head = String(out.stdout || "").trim();
      } catch {
        head = "";
      }
      await this.appendApplyChain({
        type: "git_provenance",
        chainId,
        ok: true,
        branch: cfg.policyGitCreateBranch ? branchName : "",
        commitEnabled: cfg.policyGitCommitEnabled,
        head,
        appliedFiles,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "git_provenance_failed";
      await this.appendApplyChain({
        type: "git_provenance",
        chainId,
        ok: false,
        reason: msg,
        branch: cfg.policyGitCreateBranch ? branchName : "",
      });
      void vscode.window.showWarningMessage(`Git provenance failed: ${msg}`);
    }
  }

  private async runValidationCommands(): Promise<{ ok: boolean; output: string }> {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!ws) {
      return { ok: false, output: "No workspace folder opened." };
    }
    const cfg = this.cfgSvc.read();
    const cmd = cfg.validateCommand || (await detectDefaultValidateCommand());
    try {
      const { stdout, stderr } = await execAsync(cmd, { cwd: ws, timeout: 8 * 60_000, maxBuffer: 10 * 1024 * 1024 });
      return { ok: true, output: `${stdout || ""}\n${stderr || ""}`.trim() };
    } catch (e: unknown) {
      const anyErr = e as { stdout?: string; stderr?: string; message?: string };
      const out = `${anyErr?.stdout || ""}\n${anyErr?.stderr || ""}\n${anyErr?.message || ""}`.trim();
      return { ok: false, output: out || "Validation failed." };
    }
  }

  constructor(
    private context: vscode.ExtensionContext,
    private cfgSvc: ConfigService,
    private cloudKeys: CloudKeyService,
    private ctxSvc: ContextService,
    private prompt: PromptBuilder,
    private ollama: OllamaClient,
    private models: ModelCache,
    private audit: AuditLogger,
    private telemetry: TelemetryLogger,
    private perf: ModelPerformanceService,
    private adaptive: AdaptiveStrategyService
  ) {}

  async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = getHtml(view.webview);

    try {
      await this.handleInit();
      await this.publishMetrics();
    } catch (e: unknown) {
      const c = this.cfgSvc.read();
      const ep = this.cfgSvc.activeEndpoint(c);
      post(this.view, {
        type: "init",
        endpoints: c.endpoints,
        activeEndpointId: ep.id,
        models: ep.defaultModel ? [ep.defaultModel] : [],
        hasCloudKey: false,
      });
      const message = e instanceof Error ? e.message : "Failed to load models.";
      post(this.view, { type: "error", error: message });
    }

    view.webview.onDidReceiveMessage(async (msg: UIMessage) => {
      try {
        if (msg.type === "init") {
          await this.handleInit();
          return;
        }

        if (msg.type === "stop") {
          this.abortController?.abort();
          return;
        }

        if (msg.type === "rollbackLastApply") {
          const rolledBack = await rollbackWorkspaceApply(this.lastApplySnapshots);
          if (rolledBack > 0) {
            this.lastApplySnapshots = [];
            await this.appendApplyChain({
              type: "rollback_result",
              chainId: this.lastAppliedChainId || randomUUID(),
              rolledBackFiles: rolledBack,
            });
            const cfg = this.cfgSvc.read();
            await this.telemetry.append({ type: "webview_rollback_apply", files: rolledBack }, cfg.telemetryOptIn);
            await this.publishMetrics();
            void vscode.window.showInformationMessage(`Rollback completed for ${rolledBack} file(s).`);
          } else {
            void vscode.window.showInformationMessage("No multi-file apply snapshot available to rollback.");
          }
          return;
        }

        if (msg.type === "setActiveEndpoint") {
          await this.cfgSvc.setActiveEndpointId(String(msg.endpointId || "").trim());
          return;
        }

        if (msg.type === "openCloudLogin") {
          await vscode.commands.executeCommand("ollamaCopilot.openCloudSignup");
          return;
        }

        if (msg.type === "openCloudToken") {
          await vscode.commands.executeCommand("ollamaCopilot.setCloudApiKey");
          const configured = Boolean((await this.cloudKeys.getCloudKey(this.cfgSvc.read())).trim());
          post(this.view, { type: "cloudKeyStatus", configured });
          return;
        }

        if (msg.type === "chooseLocalModel") {
          const c = this.cfgSvc.read();
          const local = findLocalEndpoint(c);
          if (!local) {
            throw new Error("Nenhum endpoint local configurado.");
          }

          let models = await safeLoadModels(this.models, this.ollama, this.cloudKeys, c, local, true);
          models = this.perf.rank(local.id, models, c.modelStrategy);
          if (!models.length && local.defaultModel) {
            models = [local.defaultModel];
          }
          if (!models.length) {
            throw new Error("Nenhum modelo local encontrado.");
          }

          const pick = await vscode.window.showQuickPick(models.map((m) => ({ label: m })), {
            title: "Escolha o modelo local",
          });
          if (!pick) {
            return;
          }

          await this.cfgSvc.setActiveEndpointId(local.id);
          await this.cfgSvc.setLastModel(pick.label);

          const ordered = [pick.label, ...models.filter((m) => m !== pick.label)];
          post(this.view, { type: "models", endpointId: local.id, models: ordered });
          post(this.view, { type: "activeEndpoint", endpointId: local.id });
          post(this.view, { type: "info", message: `Modelo local selecionado: ${pick.label}` });
          return;
        }

        if (msg.type === "testLocalConnection") {
          const c = this.cfgSvc.read();
          const local = findLocalEndpoint(c);
          if (!local) {
            post(this.view, { type: "localStatus", online: false, modelCount: 0, error: "Nenhum endpoint local configurado." });
            return;
          }

          try {
            const headers = await buildAuthHeaders(this.cloudKeys, c, local);
            const models = await this.models.getModels(this.ollama, local.baseUrl, c.timeoutMs, headers, true);
            post(this.view, {
              type: "localStatus",
              online: true,
              endpointName: local.name,
              modelCount: models.length,
            });
          } catch (e: unknown) {
            post(this.view, {
              type: "localStatus",
              online: false,
              endpointName: local.name,
              modelCount: 0,
              error: e instanceof Error ? e.message : "Falha ao conectar no Ollama local.",
            });
          }
          return;
        }

        if (msg.type === "copyLast") {
          await vscode.env.clipboard.writeText(this.lastAnswer || "");
          void vscode.window.showInformationMessage("Copied last answer.");
          return;
        }

        if (msg.type === "copyText") {
          await vscode.env.clipboard.writeText(String(msg.text ?? ""));
          return;
        }

        if (msg.type === "applyLast") {
          const source = this.lastAnswer || "";
          const applied = await this.applySource(source);
          if (applied > 0) {
            const cfg = this.cfgSvc.read();
            await this.telemetry.append({ type: "webview_apply_files", files: applied }, cfg.telemetryOptIn);
            await this.publishMetrics();
            return;
          }
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            return;
          }
          const applyText = extractBestCodeForApply(this.lastAnswer || "");
          await editor.edit((edit) => {
            edit.replace(editor.selection, applyText);
          });
          return;
        }

        if (msg.type === "applyText") {
          const source = String(msg.text ?? "");
          const applied = await this.applySource(source);
          if (applied > 0) {
            const cfg = this.cfgSvc.read();
            await this.telemetry.append({ type: "webview_apply_files", files: applied }, cfg.telemetryOptIn);
            await this.publishMetrics();
            return;
          }
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            return;
          }
          const applyText = extractBestCodeForApply(String(msg.text ?? ""));
          await editor.edit((edit) => {
            edit.replace(editor.selection, applyText);
          });
          return;
        }

        if (msg.type === "applyAndValidate") {
          const source = this.lastAnswer || "";
          const applied = await this.applySource(source);
          if (applied <= 0) {
            return;
          }
          const started = Date.now();
          const result = await this.runValidationCommands();
          const durationMs = Date.now() - started;
          const cfg = this.cfgSvc.read();
          await this.telemetry.append(
            { type: "webview_apply_validate", ok: result.ok, files: applied, durationMs },
            cfg.telemetryOptIn
          );
          await this.appendApplyChain({
            type: "validate_result",
            chainId: this.lastAppliedChainId || randomUUID(),
            ok: result.ok,
            durationMs,
            outputPreview: (result.output || "").slice(0, 800),
          });
          await this.publishMetrics();
          if (result.ok) {
            void vscode.window.showInformationMessage(`Validation passed in ${Math.round(durationMs / 1000)}s.`);
          } else {
            const out = vscode.window.createOutputChannel("Ollama Copilot Validation");
            out.appendLine(result.output);
            out.show(true);
            void vscode.window.showErrorMessage("Validation failed. See 'Ollama Copilot Validation' output.");
          }
          return;
        }

        if (msg.type === "refreshModels") {
          const c = this.cfgSvc.read();
          const ep = this.cfgSvc.activeEndpoint(c, msg.endpointId);
          const models = await safeLoadModels(this.models, this.ollama, this.cloudKeys, c, ep, true);
          const ranked = this.perf.rank(ep.id, models, c.modelStrategy);
          post(this.view, { type: "models", endpointId: ep.id, models: ranked });
          return;
        }

        if (msg.type === "send") {
          await this.handleSend(msg);
          return;
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown error";
        post(this.view, { type: "error", error: message });
      }
    });
  }

  private async handleInit(): Promise<void> {
    const c = this.cfgSvc.read();
    let ep = this.cfgSvc.activeEndpoint(c);
    let models = await safeLoadModels(this.models, this.ollama, this.cloudKeys, c, ep, false);

    // Prefer local endpoint automatically when available and healthy.
    if (c.modelStrategy === "best_local" && !isLocalEndpoint(ep.baseUrl)) {
      const localEp = c.endpoints.find((e) => isLocalEndpoint(e.baseUrl));
      if (localEp) {
        const localModels = await safeLoadModels(this.models, this.ollama, this.cloudKeys, c, localEp, false);
        if (localModels.length > 0) {
          ep = localEp;
          models = localModels;
          await this.cfgSvc.setActiveEndpointId(localEp.id);
          post(this.view, { type: "info", message: `Auto-selected local endpoint: ${localEp.name}` });
        }
      }
    }

    if (!models.length) {
      models = ep.defaultModel ? [ep.defaultModel] : [];
    }
    const effectiveStrategy = this.adaptive.effective(ep.id, c.modelStrategy);
    if (effectiveStrategy !== c.modelStrategy) {
      post(this.view, { type: "info", message: `Adaptive strategy active: ${effectiveStrategy}` });
    }
    const ranked = this.perf.rank(ep.id, models, effectiveStrategy);

    const preferred = chooseModel(c.lastModel || ep.defaultModel, ep.defaultModel, ranked, effectiveStrategy);
    if (preferred && preferred !== c.lastModel) {
      await this.cfgSvc.setLastModel(preferred);
      post(this.view, { type: "info", message: `Auto-selected model: ${preferred}` });
    }
    post(this.view, { type: "info", message: `Model strategy: ${effectiveStrategy}` });
    post(
      this.view,
      {
        type: "info",
        message: `Cloud policy: fallback=${c.cloudCatalogFallbackEnabled ? "on" : "off"} | sources=${c.cloudCatalogMaxSources}`,
      }
    );

    const hasCloudKey = Boolean((await this.cloudKeys.getCloudKey(c)).trim());
    post(this.view, { type: "init", endpoints: c.endpoints, activeEndpointId: ep.id, models: ranked, hasCloudKey });

    const local = findLocalEndpoint(c);
    if (local) {
      try {
        const headers = await buildAuthHeaders(this.cloudKeys, c, local);
        const localModels = await this.models.getModels(this.ollama, local.baseUrl, c.timeoutMs, headers, false);
        post(this.view, { type: "localStatus", online: true, endpointName: local.name, modelCount: localModels.length });
      } catch (e: unknown) {
        post(this.view, {
          type: "localStatus",
          online: false,
          endpointName: local.name,
          modelCount: 0,
          error: e instanceof Error ? e.message : "Falha ao conectar no Ollama local.",
        });
      }
    }
  }

  private async handleSend(msg: Extract<UIMessage, { type: "send" }>): Promise<void> {
    const c = this.cfgSvc.read();
    let endpoint = this.cfgSvc.activeEndpoint(c, msg.endpointId);
    const action = normalizeActionForMode(msg.mode, msg.action) as Action;
    if (msg.action && action === null) {
      throw new Error(`Invalid action "${msg.action}" for mode "${msg.mode}". Allowed: ${allowedActionsHint(msg.mode)}`);
    }

    // If Cloud is selected without token, transparently fall back to local endpoint.
    if (isOllamaDotCom(endpoint.baseUrl)) {
      const hasCloudKey = Boolean((await this.cloudKeys.getCloudKey(c)).trim());
      if (!hasCloudKey) {
        const local = findLocalEndpoint(c);
        if (local) {
          endpoint = local;
          await this.cfgSvc.setActiveEndpointId(local.id);
          post(this.view, { type: "activeEndpoint", endpointId: local.id });
          post(this.view, {
            type: "info",
            assistantId: msg.assistantId,
            message: "Cloud sem token configurado. Alternando automaticamente para Local Ollama.",
          });
        } else {
          throw new Error("Cloud requer token, e nenhum endpoint local foi encontrado para fallback.");
        }
      }
    }

    const temperature = clamp(Number(msg.temperature ?? c.superChatDefaultTemperature), 0, 2);
    const requestedModel = msg.model && String(msg.model).trim() ? String(msg.model).trim() : endpoint.defaultModel;
    const models = await safeLoadModels(this.models, this.ollama, this.cloudKeys, c, endpoint, false);
    const effectiveStrategy = this.adaptive.effective(endpoint.id, c.modelStrategy);
    if (effectiveStrategy !== c.modelStrategy) {
      post(this.view, { type: "info", assistantId: msg.assistantId, message: `Adaptive strategy active: ${effectiveStrategy}` });
    }
    const rankedModels = this.perf.rank(endpoint.id, models, effectiveStrategy, msg.mode, action);
    const model = chooseModel(requestedModel, endpoint.defaultModel, rankedModels, effectiveStrategy);
    const fallbackModel = nextFromRanked(model, rankedModels);
    if (model !== requestedModel) {
      post(this.view, { type: "info", assistantId: msg.assistantId, message: `Using model: ${model}` });
    }
    post(this.view, {
      type: "info",
      assistantId: msg.assistantId,
      message: `Model health: ${this.perf.describeHealth(endpoint.id, model, msg.mode, action)}`,
    });
    if (isOllamaDotCom(endpoint.baseUrl)) {
      const band = estimateCloudCostBand(model);
      post(
        this.view,
        { type: "info", assistantId: msg.assistantId, message: `Estimated cloud cost: ${band} | model=${model}` }
      );
    }
    if (model && model !== c.lastModel) {
      await this.cfgSvc.setLastModel(model);
    }

    const headers = await buildAuthHeaders(this.cloudKeys, c, endpoint);

    const systemPrompt =
      msg.systemPrompt && String(msg.systemPrompt).trim()
        ? String(msg.systemPrompt).trim()
        : CODEX_SYSTEM_PROMPT;

    const ctx = await this.ctxSvc.get(
      msg.flags,
      c.maxContextChars,
      c.maxContextTokens,
      c.workspaceContextMaxFiles,
      c.workspaceContextCacheMs,
      msg.text
    );

    const built = this.prompt.build(msg.mode, action, msg.text, {
      selection: ctx.selection,
      fileSnippet: ctx.fileSnippet,
      language: ctx.language,
    });

    this.abortController?.abort();
    this.abortController = new AbortController();

    const assistantId = msg.assistantId;
    const startedAt = Date.now();
    this.lastAnswer = "";

    const buildBody = (targetModel: string) => ({
      model: targetModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: built },
      ],
      stream: true,
      options: { temperature },
    });

    const timer = setTimeout(() => {
      this.abortController?.abort();
    }, c.timeoutMs);

    if (c.auditLogEnabled) {
      await this.audit.append({
        ts: new Date().toISOString(),
        type: "request_webview",
        endpointId: endpoint.id,
        baseUrl: endpoint.baseUrl,
        mode: msg.mode,
        action,
        model,
        temperature,
        flags: msg.flags,
        file: ctx.fileName,
        language: ctx.language,
        userText: msg.text,
        promptPreview: built.slice(0, 2000),
      });
    }
    await this.telemetry.append(
      {
        type: "webview_request",
        endpointId: endpoint.id,
        mode: msg.mode,
        action,
        model,
      },
      c.telemetryOptIn
    );

    let activeModel = model;
    let hasToken = false;
    let retriedWithFallback = false;

    const startStream = (targetModel: string): void => {
      this.ollama.chatStream({
        baseUrl: endpoint.baseUrl,
        headers,
        body: buildBody(targetModel),
        timeoutMs: c.timeoutMs,
        signal: this.abortController!.signal,
        onToken: (t) => {
          hasToken = true;
          this.lastAnswer += t;
          post(this.view, { type: "token", assistantId, token: t });
        },
        onError: async (e) => {
          const kind = classifyErrorKind(e.message);
          if (!hasToken && !retriedWithFallback && fallbackModel && fallbackModel !== targetModel && shouldRetryWithFallback(kind)) {
            retriedWithFallback = true;
            activeModel = fallbackModel;
            post(this.view, {
              type: "info",
              assistantId,
              message: `Primary model failed. Retrying with ${fallbackModel}...`,
            });
            await this.telemetry.append(
              {
                type: "webview_retry_local_model",
                endpointId: endpoint.id,
                mode: msg.mode,
                action,
                fromModel: targetModel,
                toModel: fallbackModel,
              },
              c.telemetryOptIn
            );
            startStream(fallbackModel);
            return;
          }

          post(this.view, { type: "error", assistantId, error: e.message });
          post(this.view, { type: "done", assistantId });
          clearTimeout(timer);

          if (c.auditLogEnabled) {
            await this.audit.append({
              ts: new Date().toISOString(),
              type: "error_webview",
              endpointId: endpoint.id,
              model: targetModel,
              error: e.message,
              durationMs: Date.now() - startedAt,
              retriedWithFallback,
            });
          }
          await this.perf.recordError(endpoint.id, targetModel, msg.mode, action);
          await this.adaptive.onFailure(endpoint.id, c.modelStrategy);
          await this.telemetry.append(
            {
              type: "webview_error",
              endpointId: endpoint.id,
              mode: msg.mode,
              action,
              model: targetModel,
              durationMs: Date.now() - startedAt,
              error: e.message,
              errorKind: kind,
              retriedWithFallback,
            },
            c.telemetryOptIn
          );
        },
        onDone: async () => {
          post(this.view, { type: "done", assistantId });
          clearTimeout(timer);
          const qualityScore = computeAnswerQuality(this.lastAnswer, action);

          if (activeModel && activeModel !== c.lastModel) {
            await this.cfgSvc.setLastModel(activeModel);
          }
          await this.perf.recordSuccess(endpoint.id, activeModel, Date.now() - startedAt, msg.mode, action);
          await this.adaptive.onSuccess(endpoint.id);

          if (c.auditLogEnabled) {
            await this.audit.append({
              ts: new Date().toISOString(),
              type: "response_webview",
              endpointId: endpoint.id,
              model: activeModel,
              durationMs: Date.now() - startedAt,
              answerPreview: (this.lastAnswer || "").slice(0, 4000),
              qualityScore,
              retriedWithFallback,
            });
          }
          await this.telemetry.append(
            {
              type: "webview_done",
              endpointId: endpoint.id,
              mode: msg.mode,
              action,
              model: activeModel,
              durationMs: Date.now() - startedAt,
              chars: this.lastAnswer.length,
              qualityScore,
              retriedWithFallback,
            },
            c.telemetryOptIn
          );
        },
      });
    };

    startStream(model);
  }
}

/** ---------------- Super Chat Participant ---------------- */

type ChatState = {
  mode: Mode;
  action: Action;
  autoLane: AutoLane;
  contextMode: ContextMode;
  temperature: number;
  endpointId?: string;
  model?: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
};

class ChatStateStore {
  private stateBySession = new Map<string, ChatState>();

  get(sessionId: string, cfg: Config): ChatState {
    const existing = this.stateBySession.get(sessionId);
    if (existing) {
      return existing;
    }

    const init: ChatState = {
      mode: cfg.superChatDefaultMode,
      action: null,
      autoLane: "other",
      contextMode: cfg.superChatDefaultContext,
      temperature: cfg.superChatDefaultTemperature,
      history: [],
    };

    this.stateBySession.set(sessionId, init);
    return init;
  }

  set(sessionId: string, next: ChatState): void {
    this.stateBySession.set(sessionId, next);
  }

  reset(sessionId: string): void {
    this.stateBySession.delete(sessionId);
  }

  resetAll(): void {
    this.stateBySession.clear();
  }
}

class SuperChatParticipant {
  constructor(
    private context: vscode.ExtensionContext,
    private cfgSvc: ConfigService,
    private cloudKeys: CloudKeyService,
    private ctxSvc: ContextService,
    private prompt: PromptBuilder,
    private ollama: OllamaClient,
    private cache: ModelCache,
    private audit: AuditLogger,
    private store: ChatStateStore,
    private telemetry: TelemetryLogger,
    private perf: ModelPerformanceService,
    private adaptive: AdaptiveStrategyService
  ) {}

  register(): void {
    // Compat: se a API de chat não existir, não quebra a extensão
    const anyVsCode = vscode as any;
    if (!anyVsCode.chat?.createChatParticipant) {
      void vscode.window.showWarningMessage(
        "Ollama Copilot: VS Code Chat API não disponível nesta versão/edição. O painel lateral (Webview) segue funcionando."
      );
      return;
    }

    const participant = anyVsCode.chat.createChatParticipant(
      "ollamaCopilot.chat",
      async (request: any, chatCtx: any, stream: any, token: any) => {
        const cfg = this.cfgSvc.read();
        const sessionId = String(chatCtx?.session?.id ?? "default");
        const state = this.store.get(sessionId, cfg);

        let text = String(request?.prompt ?? "").trim();
        if (!text) {
          stream.markdown("Digite algo :)");
          return;
        }

        // Force Ollama-only chat mode when user sends an explicit lock command.
        const ollamaLock = text.match(/^\/(?:ollama-cloud-chat|ollama)\b/i);
        if (ollamaLock) {
          const localEndpoint = findLocalEndpoint(cfg);
          if (!localEndpoint) {
            stream.markdown("Nao encontrei endpoint local do Ollama. Configure `ollamaCopilot.endpoints`.");
            return;
          }
          state.endpointId = localEndpoint.id;
          state.action = null;
          this.store.set(sessionId, state);
          await this.cfgSvc.setActiveEndpointId(localEndpoint.id);
          text = text.replace(/^\/(?:ollama-cloud-chat|ollama)\b/i, "").trim();
          if (!text) {
            stream.markdown(`OK: modo Ollama ativo em **${localEndpoint.name}**.`);
            return;
          }
        }

        if (text.startsWith("/help")) {
          stream.markdown(
            [
              "**Comandos Super Chat**",
              "- `/ollama-cloud-chat` ou `/ollama`: trava no endpoint local do Ollama",
              "- `/endpoint local|cloud`: escolhe onde ficar (local ou cloud)",
              "- `/login` ou `/ollama.com`: abre login do Ollama Cloud no navegador",
              "- `/token` ou `/apikey`: abre janela para colar API Key do Ollama Cloud",
              "- `/provider` ou `/endpoint`: escolher provedor e modelo",
              "- `/mode code|ds|devds|devops|infra|pbi`: muda modo",
              "- `/action <acao>`: define acao atual",
              "- `/context off|selection|file|workspace`: contexto do editor/workspace",
              "- `/temp <0..2>`: temperatura",
              "- `/status`: mostra estado da sessao",
              "- `/reset`: reseta estado da sessao",
            ].join("\n")
          );
          return;
        }

        if (text.startsWith("/login") || text.startsWith("/ollama.com")) {
          await vscode.commands.executeCommand("ollamaCopilot.openCloudSignup");
          stream.markdown("OK: login do Ollama Cloud aberto no navegador.");
          return;
        }

        if (text.startsWith("/token") || text.startsWith("/apikey")) {
          await vscode.commands.executeCommand("ollamaCopilot.setCloudApiKey");
          stream.markdown("OK: janela de API Key aberta.");
          return;
        }

        if (text.startsWith("/status")) {
          const activeEndpoint = this.cfgSvc.activeEndpoint(cfg, state.endpointId);
          stream.markdown(
            `Endpoint: **${activeEndpoint.name}**\nLane: **${state.autoLane}**\nMode: **${state.mode}**\nAction: **${state.action ?? "none"}**\nContext: **${state.contextMode}**\nTemperature: **${state.temperature}**\nModel: **${state.model ?? "(default)"}**`
          );
          return;
        }

        // Slash commands
        if (text.startsWith("/provider") || text.startsWith("/endpoint")) {
          const endpointArg = (text.split(/\s+/)[1] ?? "").trim().toLowerCase();
          if (endpointArg === "local" || endpointArg === "cloud") {
            const endpoint = endpointArg === "local" ? findLocalEndpoint(cfg) : findCloudEndpoint(cfg);
            if (!endpoint) {
              stream.markdown(`Nao encontrei endpoint ${endpointArg}. Verifique \`ollamaCopilot.endpoints\`.`);
              return;
            }
            state.endpointId = endpoint.id;
            state.model = undefined;
            this.store.set(sessionId, state);
            await this.cfgSvc.setActiveEndpointId(endpoint.id);
            stream.markdown(`OK: endpoint fixado em **${endpoint.name}**.`);
            return;
          }
          const picked = await this.chooseProviderAndModel(cfg);
          if (!picked) {
            stream.markdown("Ok - sem alteracoes.");
            return;
          }
          state.endpointId = picked.endpoint.id;
          state.model = picked.model;
          this.store.set(sessionId, state);
          stream.markdown(`OK: ativo **${picked.endpoint.name}** | **${picked.model}**`);
          return;
        }

        if (text.startsWith("/mode")) {
          const m = text.split(/\s+/)[1] as Mode | undefined;
          if (m === "code" || m === "ds" || m === "devds" || m === "devops" || m === "infra" || m === "pbi") {
            state.mode = m;
            state.action = null;
            this.store.set(sessionId, state);
            stream.markdown(`OK: mode **${m}**`);
            return;
          }
          stream.markdown("Use: `/mode code` ou `/mode ds` ou `/mode devds` ou `/mode devops` ou `/mode infra` ou `/mode pbi`");
          return;
        }

        if (text.startsWith("/action")) {
          const raw = (text.split(/\s+/)[1] ?? "").trim();
          const candidate = (raw ? (raw as Action) : null);
          if (candidate !== null && !isActionAllowedForMode(state.mode, candidate)) {
            stream.markdown(`Action invalida para mode "${state.mode}". Use: ${allowedActionsHint(state.mode)}`);
            return;
          }
          state.action = candidate;
          this.store.set(sessionId, state);
          stream.markdown(`OK: action **${state.action ?? "none"}**`);
          return;
        }

        if (text.startsWith("/context")) {
          const c = (text.split(/\s+/)[1] ?? "").trim() as ContextMode;
          if (c === "off" || c === "selection" || c === "file" || c === "workspace") {
            state.contextMode = c;
            this.store.set(sessionId, state);
            stream.markdown(`OK: context **${c}**`);
            return;
          }
          stream.markdown("Use: `/context off` ou `/context selection` ou `/context file` ou `/context workspace`");
          return;
        }

        if (text.startsWith("/temp")) {
          const v = Number(text.split(/\s+/)[1] ?? "");
          if (Number.isFinite(v)) {
            state.temperature = clamp(v, 0, 2);
            this.store.set(sessionId, state);
            stream.markdown(`OK: temperature **${state.temperature}**`);
            return;
          }
          stream.markdown("Use: `/temp 0.3` (0 a 2)");
          return;
        }

        if (text.startsWith("/reset")) {
          this.store.reset(sessionId);
          stream.markdown("OK: sessao resetada.");
          return;
        }

        const inferred = inferAutoModeAndAction(text);
        const modeChanged = state.mode !== inferred.mode;
        const actionChanged = state.action !== inferred.action;
        const laneChanged = state.autoLane !== inferred.lane;
        state.autoLane = inferred.lane;
        state.mode = inferred.mode;
        state.action = inferred.action;
        this.store.set(sessionId, state);
        if (laneChanged || modeChanged || actionChanged) {
          stream.markdown(`Auto lane: **${inferred.lane}** | mode: **${inferred.mode}** | action: **${inferred.action ?? "none"}**`);
        }

        const endpoint = this.cfgSvc.activeEndpoint(cfg, state.endpointId);
        const preferredModel = state.model?.trim() ? state.model : cfg.lastModel || endpoint.defaultModel;
        const endpointModels = await safeLoadModels(this.cache, this.ollama, this.cloudKeys, cfg, endpoint, false);
        const provisionalAction = normalizeActionForMode(state.mode, state.action) as Action;
        const effectiveStrategy = this.adaptive.effective(endpoint.id, cfg.modelStrategy);
        if (effectiveStrategy !== cfg.modelStrategy) {
          stream.markdown(`Adaptive strategy active: **${effectiveStrategy}**`);
        }
        const rankedModels = this.perf.rank(endpoint.id, endpointModels, effectiveStrategy, state.mode, provisionalAction);
        const model = chooseModel(preferredModel, endpoint.defaultModel, rankedModels, effectiveStrategy);
        const fallbackModel = nextFromRanked(model, rankedModels);
        if (model !== state.model) {
          state.model = model;
          this.store.set(sessionId, state);
          stream.markdown(`Using model: **${model}**`);
        }
        stream.markdown(`Model health: **${this.perf.describeHealth(endpoint.id, model, state.mode, provisionalAction)}**`);
        if (isOllamaDotCom(endpoint.baseUrl)) {
          stream.markdown(`Estimated cloud cost: **${estimateCloudCostBand(model)}**`);
        }
        if (model && model !== cfg.lastModel) {
          await this.cfgSvc.setLastModel(model);
        }

        const headers = await buildAuthHeaders(this.cloudKeys, cfg, endpoint);

        const flags = this.ctxSvc.flagsFromContextMode(state.contextMode);
        const editorCtx = await this.ctxSvc.get(
          flags,
          cfg.maxContextChars,
          cfg.maxContextTokens,
          cfg.workspaceContextMaxFiles,
          cfg.workspaceContextCacheMs,
          text
        );

        const safeAction = normalizeActionForMode(state.mode, state.action) as Action;
        if (state.action !== safeAction) {
          state.action = safeAction;
          this.store.set(sessionId, state);
        }

        const built = this.prompt.build(state.mode, safeAction, text, {
          selection: editorCtx.selection,
          fileSnippet: editorCtx.fileSnippet,
          language: editorCtx.language,
        });

        state.history.push({ role: "user", content: text });
        state.history = compactHistory(state.history, cfg.superChatHistoryMaxChars);
        this.store.set(sessionId, state);

        const systemPrompt = CODEX_SYSTEM_PROMPT;

        const startedAt = Date.now();
        if (cfg.auditLogEnabled) {
          await this.audit.append({
            ts: new Date().toISOString(),
            type: "request_chat",
            endpointId: endpoint.id,
            baseUrl: endpoint.baseUrl,
            model,
            mode: state.mode,
            action: safeAction,
            contextMode: state.contextMode,
            temp: state.temperature,
            file: editorCtx.fileName,
            language: editorCtx.language,
            userText: text,
            promptPreview: built.slice(0, 2000),
          });
        }
        await this.telemetry.append(
          {
            type: "chat_request",
            endpointId: endpoint.id,
            mode: state.mode,
            action: safeAction,
            model,
          },
          cfg.telemetryOptIn
        );

        const abort = new AbortController();
        const timer = setTimeout(() => {
          abort.abort();
        }, cfg.timeoutMs);

        token?.onCancellationRequested?.(() => {
          abort.abort();
        });

        let answer = "";
        let activeModel = model;
        let hasToken = false;
        let retriedWithFallback = false;

        const buildBody = (targetModel: string) => ({
          model: targetModel,
          stream: true,
          options: { temperature: state.temperature },
          messages: [
            { role: "system", content: systemPrompt },
            ...state.history
              .slice(0, -1)
              .slice(-6)
              .map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: built },
          ],
        });

        await new Promise<void>((resolve) => {
          const startStream = (targetModel: string): void => {
            this.ollama.chatStream({
              baseUrl: endpoint.baseUrl,
              headers,
              timeoutMs: cfg.timeoutMs,
              signal: abort.signal,
              body: buildBody(targetModel),
              onToken: (t) => {
                hasToken = true;
                answer += t;
                stream.markdown(t);
              },
              onError: async (e) => {
                const kind = classifyErrorKind(e.message);
                if (
                  !hasToken &&
                  !retriedWithFallback &&
                  fallbackModel &&
                  fallbackModel !== targetModel &&
                  shouldRetryWithFallback(kind)
                ) {
                  retriedWithFallback = true;
                  activeModel = fallbackModel;
                  stream.markdown(`\n\nPrimary model failed. Retrying with **${fallbackModel}**...`);
                  await this.telemetry.append(
                    {
                      type: "chat_retry_local_model",
                      endpointId: endpoint.id,
                      mode: state.mode,
                      action: safeAction,
                      fromModel: targetModel,
                      toModel: fallbackModel,
                    },
                    cfg.telemetryOptIn
                  );
                  startStream(fallbackModel);
                  return;
                }

                try {
                  clearTimeout(timer);
                  await this.perf.recordError(endpoint.id, targetModel, state.mode, safeAction);
                  await this.adaptive.onFailure(endpoint.id, cfg.modelStrategy);
                  stream.markdown(`\n\nError: ${e.message}`);

                  if (cfg.auditLogEnabled) {
                    await this.audit.append({
                      ts: new Date().toISOString(),
                      type: "error_chat",
                      endpointId: endpoint.id,
                      model: targetModel,
                      error: e.message,
                      durationMs: Date.now() - startedAt,
                      retriedWithFallback,
                    });
                  }
                  await this.telemetry.append(
                    {
                      type: "chat_error",
                      endpointId: endpoint.id,
                      mode: state.mode,
                      action: safeAction,
                      model: targetModel,
                      durationMs: Date.now() - startedAt,
                      error: e.message,
                      errorKind: kind,
                      retriedWithFallback,
                    },
                    cfg.telemetryOptIn
                  );
                } catch {
                  // ignore logging failures to avoid breaking chat flow
                }
                resolve();
              },
              onDone: async () => {
                try {
                  clearTimeout(timer);
                  const qualityScore = computeAnswerQuality(answer, safeAction);
                  await this.perf.recordSuccess(endpoint.id, activeModel, Date.now() - startedAt, state.mode, safeAction);
                  await this.adaptive.onSuccess(endpoint.id);

                  state.history.push({ role: "assistant", content: answer });
                  state.history = compactHistory(state.history, cfg.superChatHistoryMaxChars);
                  this.store.set(sessionId, state);

                  if (cfg.auditLogEnabled) {
                    await this.audit.append({
                      ts: new Date().toISOString(),
                      type: "response_chat",
                      endpointId: endpoint.id,
                      model: activeModel,
                      durationMs: Date.now() - startedAt,
                      answerPreview: answer.slice(0, 4000),
                      qualityScore,
                      retriedWithFallback,
                    });
                  }
                  await this.telemetry.append(
                    {
                      type: "chat_done",
                      endpointId: endpoint.id,
                      mode: state.mode,
                      action: safeAction,
                      model: activeModel,
                      durationMs: Date.now() - startedAt,
                      chars: answer.length,
                      qualityScore,
                      retriedWithFallback,
                    },
                    cfg.telemetryOptIn
                  );
                } catch {
                  // ignore logging failures to avoid breaking chat flow
                }
                resolve();
              },
            });
          };

          startStream(model);
        });
      }
    );
    participant.iconPath = new vscode.ThemeIcon("comment-discussion");
    this.context.subscriptions.push(participant);
  }

  private async chooseProviderAndModel(cfg: Config): Promise<{ endpoint: Endpoint; model: string } | undefined> {
    const epItems: Array<vscode.QuickPickItem & { endpoint: Endpoint }> = cfg.endpoints.map((e) => ({
      label: e.name,
      description: e.baseUrl,
      endpoint: e,
    }));

    const epPick = await vscode.window.showQuickPick(epItems, {
      title: "Escolha o provedor (Local Ollama ou Cloud)",
    });

    if (!epPick) {
      return undefined;
    }

    const endpoint = epPick.endpoint;
    await this.cfgSvc.setActiveEndpointId(endpoint.id);

    let models: string[] = [];
    try {
      models = await safeLoadModels(this.cache, this.ollama, this.cloudKeys, cfg, endpoint, true);
      models = this.perf.rank(endpoint.id, models, cfg.modelStrategy);
    } catch {
      // allow manual input
    }

    const preferred = (cfg.lastModel || endpoint.defaultModel || models[0] || "").trim();
    let model = preferred;

    if (models.length) {
      const mPick = await vscode.window.showQuickPick(models.map((m) => ({ label: m })), { title: "Escolha o modelo" });
      if (!mPick) {
        return undefined;
      }
      model = mPick.label;
    } else {
      const typed = await vscode.window.showInputBox({
        title: "Digite o modelo (ex: llama3.2:latest)",
        value: preferred,
      });

      if (!typed) {
        return undefined;
      }
      model = typed.trim();
    }

    await this.cfgSvc.setLastModel(model);
    return { endpoint, model };
  }
}

function compactHistory(items: Array<{ role: "user" | "assistant"; content: string }>, maxChars: number) {
  if (maxChars <= 0) {
    return [];
  }

  let total = items.reduce((acc, it) => acc + it.content.length, 0);
  const copy = [...items];

  while (copy.length > 2 && total > maxChars) {
    const removed = copy.shift();
    if (removed) {
      total -= removed.content.length;
    }
  }
  return copy;
}

/** ---------------- Auth headers helper ---------------- */

async function buildAuthHeaders(keys: CloudKeyService, cfg: Config, endpoint: Endpoint): Promise<Record<string, string>> {
  if (!isOllamaDotCom(endpoint.baseUrl)) {
    return {};
  }

  const key = await keys.getCloudKey(cfg);
  if (!key) {
    return {};
  }

  return { Authorization: `Bearer ${key}` };
}

async function handleLegacyUpgradePrompt(context: vscode.ExtensionContext): Promise<void> {
  const UPGRADE_PROMPT_KEY = "ollamaCopilot.legacyUpgradePromptHandled";
  const handled = context.globalState.get<boolean>(UPGRADE_PROMPT_KEY, false);
  if (handled) {
    return;
  }

  // Candidate legacy extension IDs that may conflict with this extension.
  const legacyIds = [
    "LissandraKruseFuganti.ollama-code-assistant",
    "LissandraKruseFuganti.ollama-code-assistant-node",
    "LissandraKruseFuganti.ollama-copilot",
  ];

  const installedLegacy = legacyIds.find((id) => Boolean(vscode.extensions.getExtension(id)));
  if (!installedLegacy) {
    return;
  }

  const decision = await vscode.window.showInformationMessage(
    `Legacy extension detected (${installedLegacy}). Do you want to uninstall it to avoid conflicts?`,
    "Uninstall Old Extension",
    "Keep Both"
  );

  if (decision !== "Uninstall Old Extension") {
    await context.globalState.update(UPGRADE_PROMPT_KEY, true);
    return;
  }

  await vscode.commands.executeCommand("workbench.extensions.uninstallExtension", installedLegacy);
  await context.globalState.update(UPGRADE_PROMPT_KEY, true);
  const reload = await vscode.window.showInformationMessage("Old extension removed. Reload window now?", "Reload");
  if (reload === "Reload") {
    await vscode.commands.executeCommand("workbench.action.reloadWindow");
  }
}

async function handleFirstRunCloudOnboarding(context: vscode.ExtensionContext, cfgSvc: ConfigService): Promise<void> {
  const ONBOARDING_KEY = "ollamaCopilot.cloudOnboardingDone";
  const alreadyDone = context.globalState.get<boolean>(ONBOARDING_KEY, false);
  if (alreadyDone) {
    return;
  }

  const cfg = cfgSvc.read();
  const hasCloudEndpoint = cfg.endpoints.some((e) => isOllamaDotCom(e.baseUrl));
  if (!hasCloudEndpoint) {
    return;
  }

  await context.globalState.update(ONBOARDING_KEY, true);

  await vscode.window.showInformationMessage(
    "Why this step? EN: To use Ollama Cloud models, you need to sign in and create an API key. PT-BR: Para usar modelos do Ollama Cloud, voce precisa fazer login e criar uma API key."
  );

  const start = await vscode.window.showInformationMessage(
    "EN: Open ollama.com now to sign in and get your API key? PT-BR: Abrir ollama.com agora para fazer login e obter sua API key?",
    "Open Ollama",
    "Skip"
  );
  if (start !== "Open Ollama") {
    return;
  }

  await vscode.env.openExternal(vscode.Uri.parse("https://ollama.com"));

  const openKeys = await vscode.window.showInformationMessage(
    "EN: After login, open the API Keys page? PT-BR: Depois do login, abrir a pagina de API Keys?",
    "Open Keys",
    "Later"
  );
  if (openKeys !== "Open Keys") {
    return;
  }

  await vscode.env.openExternal(vscode.Uri.parse("https://ollama.com/settings/keys"));

  const setNow = await vscode.window.showInformationMessage(
    "EN: Do you want to save your API key now? PT-BR: Voce quer salvar sua API key agora?",
    "Set API Key",
    "Later"
  );
  if (setNow === "Set API Key") {
    await vscode.commands.executeCommand("ollamaCopilot.setCloudApiKey");
  }
}

async function runSettingsMigrations(context: vscode.ExtensionContext): Promise<void> {
  const MIGRATION_KEY = "ollamaCopilot.settingsSchemaVersion";
  const CURRENT_VERSION = 1;
  const prev = context.globalState.get<number>(MIGRATION_KEY, 0);
  if (prev >= CURRENT_VERSION) {
    return;
  }

  const cfg = vscode.workspace.getConfiguration("ollamaCopilot");

  // Migration v1:
  // - normalize unknown default mode values to "devds".
  const mode = String(cfg.get("superChat.defaultMode", "devds"));
  const validModes = new Set(["code", "ds", "devds", "devops", "infra", "pbi"]);
  if (!validModes.has(mode)) {
    await cfg.update("superChat.defaultMode", "devds", vscode.ConfigurationTarget.Global);
  }

  await context.globalState.update(MIGRATION_KEY, CURRENT_VERSION);
}

async function handleVersionUpdateNotice(context: vscode.ExtensionContext): Promise<void> {
  const KEY = "ollamaCopilot.lastSeenVersion";
  const currentVersion = String(context.extension.packageJSON.version || "").trim();
  if (!currentVersion) {
    return;
  }

  const lastSeen = String(context.globalState.get<string>(KEY, "") || "").trim();
  if (!lastSeen) {
    await context.globalState.update(KEY, currentVersion);
    return;
  }

  if (lastSeen === currentVersion) {
    return;
  }

  await context.globalState.update(KEY, currentVersion);

  const choice = await vscode.window.showInformationMessage(
    `Ollama Copilot updated: ${lastSeen} -> ${currentVersion}.`,
    "View Changelog",
    "Reload Window",
    "Later"
  );

  if (choice === "View Changelog") {
    const changelogUri = vscode.Uri.joinPath(context.extensionUri, "CHANGELOG.md");
    await vscode.commands.executeCommand("markdown.showPreview", changelogUri);
    return;
  }

  if (choice === "Reload Window") {
    await vscode.commands.executeCommand("workbench.action.reloadWindow");
  }
}

async function handleTelemetryOptInPrompt(context: vscode.ExtensionContext): Promise<void> {
  const KEY = "ollamaCopilot.telemetryPromptDone";
  const done = context.globalState.get<boolean>(KEY, false);
  if (done) {
    return;
  }

  const choice = await vscode.window.showInformationMessage(
    "Enable optional local telemetry? It stores anonymous performance events in .ollama_copilot_telemetry.jsonl (workspace only).",
    "Enable",
    "Not Now"
  );

  if (choice === "Enable") {
    const cfg = vscode.workspace.getConfiguration("ollamaCopilot");
    await cfg.update("telemetry.optIn", true, vscode.ConfigurationTarget.Global);
  }
  await context.globalState.update(KEY, true);
}

async function handleFirstRunOpenSidebar(context: vscode.ExtensionContext): Promise<void> {
  const KEY = "ollamaCopilot.firstRunSidebarOpened";
  const done = context.globalState.get<boolean>(KEY, false);
  if (done) {
    return;
  }

  await context.globalState.update(KEY, true);
  await vscode.commands.executeCommand("workbench.view.extension.ollamaCopilot");
}

/** ---------------- Activate / Deactivate ---------------- */

export function activate(context: vscode.ExtensionContext): void {
  const cfgSvc = new ConfigService();
  const cloudKeys = new CloudKeyService(context);
  const ctxSvc = new ContextService();
  const prompt = new PromptBuilder();
  const ollama = new OllamaClient();
  const cache = new ModelCache();
  const audit = new AuditLogger();
  const telemetry = new TelemetryLogger();
  const perf = new ModelPerformanceService(context);
  const adaptive = new AdaptiveStrategyService(context);
  const store = new ChatStateStore();

  // Webview (painel lateral)
  const viewProvider = new ChatViewProvider(
    context,
    cfgSvc,
    cloudKeys,
    ctxSvc,
    prompt,
    ollama,
    cache,
    audit,
    telemetry,
    perf,
    adaptive
  );
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(ChatViewProvider.viewId, viewProvider));

  // Status bar quick access (one-click open)
  const statusBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBtn.command = "ollama-copilot-devds.openChat";
  statusBtn.text = "$(hubot)";
  statusBtn.tooltip = "Open Ollama Copilot Chat";
  statusBtn.show();
  context.subscriptions.push(statusBtn);

  // Básicos
  context.subscriptions.push(
    vscode.commands.registerCommand("ollama-copilot-devds.openChat", async () => {
      await vscode.commands.executeCommand("workbench.view.extension.ollamaCopilot");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ollama-copilot-devds.selectEndpoint", async () => {
      const c = cfgSvc.read();
      const pick = await vscode.window.showQuickPick(
        c.endpoints.map((e) => ({ label: e.name, description: e.baseUrl, id: e.id })),
        { title: "Ollama Copilot: Select Endpoint" }
      );

      if (!pick) {
        return;
      }

      await cfgSvc.setActiveEndpointId(pick.id);
      void vscode.window.showInformationMessage(`Ollama Copilot: active endpoint = ${pick.label}`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ollama-copilot-devds.refreshModels", async () => {
      void vscode.window.showInformationMessage("Use o botão Refresh no painel de Chat para recarregar os modelos.");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ollamaCopilot.verifyCustodyTrail", async () => {
      await viewProvider.verifyCustodyTrailCommand();
    })
  );

  // Super Chat helpers (Command Palette)
  context.subscriptions.push(
    vscode.commands.registerCommand("ollamaCopilot.superChat.chooseProvider", async () => {
      const c = cfgSvc.read();
      const epPick = await vscode.window.showQuickPick(
        c.endpoints.map((e) => ({ label: e.name, description: e.baseUrl, endpoint: e })),
        { title: "Super Chat: Choose Provider" }
      );

      if (!epPick) {
        return;
      }

      await cfgSvc.setActiveEndpointId(epPick.endpoint.id);

      let models: string[] = [];
      try {
        models = await safeLoadModels(cache, ollama, cloudKeys, c, epPick.endpoint, true);
        models = perf.rank(epPick.endpoint.id, models, c.modelStrategy);
      } catch {
        // allow manual model typing
      }

      const preferred = (c.lastModel || epPick.endpoint.defaultModel || models[0] || "").trim();
      let model = preferred;

      if (models.length) {
        const mPick = await vscode.window.showQuickPick(models.map((m) => ({ label: m })), {
          title: "Super Chat: Choose Model",
        });
        if (!mPick) {
          return;
        }
        model = mPick.label;
      } else {
        const typed = await vscode.window.showInputBox({
          title: "Super Chat: Model Name",
          value: preferred,
          prompt: "Ex.: llama3.2:latest",
        });
        if (!typed) {
          return;
        }
        model = typed.trim();
      }

      await cfgSvc.setLastModel(model);
      void vscode.window.showInformationMessage(`Super Chat ativo: ${epPick.label} | ${model}`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ollamaCopilot.superChat.setMode", async () => {
      const pick = await vscode.window.showQuickPick(
        [
          { label: "devds", description: "Developer + Data Science (hybrid)" },
          { label: "devops", description: "DevOps + PowerShell" },
          { label: "infra", description: "Infrastructure + PowerShell" },
          { label: "code", description: "Software engineering" },
          { label: "ds", description: "Data science" },
          { label: "pbi", description: "Power BI" },
        ],
        { title: "Super Chat: Set Default Mode" }
      );
      if (!pick) {
        return;
      }
      const cfg = vscode.workspace.getConfiguration("ollamaCopilot");
      await cfg.update("superChat.defaultMode", pick.label, vscode.ConfigurationTarget.Global);
      void vscode.window.showInformationMessage(`Super Chat default mode: ${pick.label}`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ollamaCopilot.superChat.setContext", async () => {
      const pick = await vscode.window.showQuickPick(
        [
          { label: "off", description: "No editor context" },
          { label: "selection", description: "Only selected text" },
          { label: "file", description: "File snippet around cursor" },
          { label: "workspace", description: "Multi-file workspace context" },
        ],
        { title: "Super Chat: Set Default Context" }
      );
      if (!pick) {
        return;
      }
      const cfg = vscode.workspace.getConfiguration("ollamaCopilot");
      await cfg.update("superChat.defaultContext", pick.label, vscode.ConfigurationTarget.Global);
      void vscode.window.showInformationMessage(`Super Chat default context: ${pick.label}`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ollamaCopilot.setModelStrategy", async () => {
      const pick = await vscode.window.showQuickPick(
        [
          { label: "best_local", description: "Prefer best local model automatically" },
          { label: "user_selected", description: "Always prioritize selected/default model" },
          { label: "fastest", description: "Prefer fastest local model automatically" },
        ],
        { title: "Ollama Copilot: Model Strategy" }
      );
      if (!pick) {
        return;
      }
      await cfgSvc.setModelStrategy(pick.label as ModelStrategy);
      void vscode.window.showInformationMessage(`Model strategy: ${pick.label}`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ollamaCopilot.superChat.resetSession", async () => {
      store.resetAll();
      void vscode.window.showInformationMessage("Super Chat session state resetado.");
    })
  );

  // Cloud helpers
  context.subscriptions.push(
    vscode.commands.registerCommand("ollamaCopilot.openCloudSignup", async () => {
      await vscode.env.openExternal(vscode.Uri.parse("https://ollama.com"));

      const next = await vscode.window.showInformationMessage(
        "EN: After login, open API Keys and save token now? PT-BR: Depois do login, abrir API Keys e salvar token agora?",
        "Open Keys",
        "Set API Key",
        "Later"
      );

      if (next === "Open Keys") {
        await vscode.env.openExternal(vscode.Uri.parse("https://ollama.com/settings/keys"));
        const setNow = await vscode.window.showInformationMessage(
          "EN: Do you want to save your API key now? PT-BR: Voce quer salvar sua API key agora?",
          "Set API Key",
          "Later"
        );
        if (setNow === "Set API Key") {
          await vscode.commands.executeCommand("ollamaCopilot.setCloudApiKey");
        }
        return;
      }

      if (next === "Set API Key") {
        await vscode.commands.executeCommand("ollamaCopilot.setCloudApiKey");
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ollamaCopilot.openCloudKeys", async () => {
      await vscode.env.openExternal(vscode.Uri.parse("https://ollama.com/settings/keys"));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ollamaCopilot.setCloudCatalogPolicy", async () => {
      const mode = await vscode.window.showQuickPick(
        [
          { label: "enabled", description: "Use official docs/site fallback when cloud tags fail" },
          { label: "disabled", description: "Never fetch cloud catalog from website pages" },
        ],
        { title: "Cloud Catalog Fallback" }
      );
      if (!mode) {
        return;
      }
      const cfg = vscode.workspace.getConfiguration("ollamaCopilot");
      const enabled = mode.label === "enabled";
      await cfg.update("cloud.catalogFallbackEnabled", enabled, vscode.ConfigurationTarget.Global);

      if (enabled) {
        const sourcesPick = await vscode.window.showQuickPick(
          [
            { label: "1", description: "Minimum network usage" },
            { label: "2", description: "Balanced" },
            { label: "3", description: "Maximum fallback coverage" },
          ],
          { title: "Cloud Catalog Sources Count" }
        );
        if (sourcesPick) {
          await cfg.update("cloud.catalogMaxSources", Number(sourcesPick.label), vscode.ConfigurationTarget.Global);
        }
      }

      void vscode.window.showInformationMessage(`Cloud catalog fallback: ${enabled ? "enabled" : "disabled"}.`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ollamaCopilot.createPolicyTemplate", async () => {
      const cfg = cfgSvc.read();
      const ws = vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!ws) {
        void vscode.window.showErrorMessage("Open a workspace folder first.");
        return;
      }
      const fileName = cfg.policyFile || ".ollama_policies.json";
      const uri = vscode.Uri.joinPath(ws, fileName);
      let exists = true;
      try {
        await vscode.workspace.fs.stat(uri);
      } catch {
        exists = false;
      }
      if (exists) {
        const choice = await vscode.window.showWarningMessage(
          `${fileName} already exists. Overwrite?`,
          { modal: true },
          "Overwrite",
          "Cancel"
        );
        if (choice !== "Overwrite") {
          return;
        }
      }
      const enc = new TextEncoder();
      await vscode.workspace.fs.writeFile(uri, enc.encode(defaultPolicyTemplateJson()));
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: false });
      void vscode.window.showInformationMessage(`Policy template ready: ${fileName}`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ollamaCopilot.setCloudApiKey", async () => {
      const key = await vscode.window.showInputBox({
        title: "Cole sua Ollama Cloud API Key",
        prompt: "Você encontra em ollama.com/settings/keys",
        password: true,
        ignoreFocusOut: true,
      });

      if (!key) {
        return;
      }

      await cloudKeys.setCloudKey(key);
      void vscode.window.showInformationMessage("✅ API Key salva com segurança (SecretStorage).");
    })
  );

  // Super Chat (Chat Participant)
  const superChat = new SuperChatParticipant(
    context,
    cfgSvc,
    cloudKeys,
    ctxSvc,
    prompt,
    ollama,
    cache,
    audit,
    store,
    telemetry,
    perf,
    adaptive
  );
  superChat.register();

  // Settings migration/versioning.
  void runSettingsMigrations(context);
  if (!isTestMode()) {
    // Offer one-click upgrade path from legacy extension IDs.
    void handleLegacyUpgradePrompt(context);
    // Show update notice when extension version changes.
    void handleVersionUpdateNotice(context);
    // First-run cloud onboarding (login + keys).
    void handleFirstRunCloudOnboarding(context, cfgSvc);
    // Optional local telemetry opt-in prompt.
    void handleTelemetryOptInPrompt(context);
    // Make sidebar visible on first install/use.
    void handleFirstRunOpenSidebar(context);
  }
}

export function deactivate(): void {}

