import fs from "fs";
import path from "path";

const file = path.join(process.cwd(), "tools", "golden-cases.json");
const raw = fs.readFileSync(file, "utf8");
const cases = JSON.parse(raw);

const failures = [];

for (const c of cases) {
  const output = String(c.output || "");
  const mustContain = Array.isArray(c.mustContain) ? c.mustContain : [];
  const missing = mustContain.filter((token) => !output.includes(String(token)));
  if (missing.length) {
    failures.push({ name: c.name || "unnamed", missing });
  }
}

if (failures.length) {
  console.error("Golden eval failed:");
  for (const f of failures) {
    console.error(`- ${f.name}: missing ${f.missing.join(", ")}`);
  }
  process.exit(1);
}

console.log(`Golden eval passed (${cases.length} cases).`);
