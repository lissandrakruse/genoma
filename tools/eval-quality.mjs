import fs from "fs";
import path from "path";

const root = process.cwd();
const extensionPath = path.join(root, "src", "extension.ts");
const webviewPath = path.join(root, "src", "webviewHtml.ts");

const extension = fs.readFileSync(extensionPath, "utf8");
const webview = fs.readFileSync(webviewPath, "utf8");

const checks = [
  {
    name: "Codex system prompt includes solution-first behavior",
    ok: extension.includes("Start with the solution/result"),
  },
  {
    name: "Code mode asks for patch-ready code",
    ok: extension.includes("patch-ready code"),
  },
  {
    name: "Workspace context mode is enabled",
    ok: extension.includes('"workspace"') && extension.includes("useWorkspace"),
  },
  {
    name: "Webview has model quick combobox",
    ok: webview.includes('id="modelQuick"') && webview.includes("modelQuickList"),
  },
  {
    name: "Webview supports rollback action",
    ok: webview.includes('id="rollbackLastApply"') && extension.includes("rollbackLastApply"),
  },
];

const failed = checks.filter((c) => !c.ok);

if (failed.length) {
  console.error("Quality eval failed:");
  for (const f of failed) {
    console.error(`- ${f.name}`);
  }
  process.exit(1);
}

console.log(`Quality eval passed (${checks.length} checks).`);
