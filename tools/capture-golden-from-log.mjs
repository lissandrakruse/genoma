import fs from "fs";
import path from "path";

const root = process.cwd();
const logPath = path.join(root, ".ollama_copilot_log.jsonl");
const outPath = path.join(root, "tools", "golden-candidates.json");

if (!fs.existsSync(logPath)) {
  console.log("No .ollama_copilot_log.jsonl found. Nothing to capture.");
  process.exit(0);
}

const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/).filter(Boolean);
const candidates = [];

for (const line of lines) {
  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    continue;
  }
  if (!obj || typeof obj !== "object") {
    continue;
  }
  if (obj.type !== "response_chat" && obj.type !== "response_webview") {
    continue;
  }
  const preview = String(obj.answerPreview || "").trim();
  if (!preview) {
    continue;
  }
  const sanitized = preview
    .replace(/[A-Za-z]:\\\\[^ \n]+/g, "<path>")
    .replace(/\/[A-Za-z0-9._/-]+/g, (m) => (m.length > 80 ? "<path>" : m));
  candidates.push({
    ts: obj.ts || "",
    mode: obj.mode || "",
    action: obj.action || "",
    output: sanitized,
  });
}

fs.writeFileSync(outPath, JSON.stringify(candidates.slice(-200), null, 2), "utf8");
console.log(`Golden candidates written: ${outPath} (${Math.min(candidates.length, 200)} items).`);
