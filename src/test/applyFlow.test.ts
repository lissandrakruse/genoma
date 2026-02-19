import * as assert from "assert";
import { suite, test } from "mocha";
import { applyUnifiedDiffToText, buildApplyPreview, parseUnifiedDiff, parseWorkspaceFileBlocks } from "../applyFlowCore";

suite("Apply Flow", () => {
  const sampleDiff = [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1,3 +1,4 @@",
    " const a = 1;",
    "+const b = 2;",
    " export function x(){",
    "   return a;",
    " }",
  ].join("\n");

  test("parseUnifiedDiff extracts file and hunks", () => {
    const parsed = parseUnifiedDiff(sampleDiff);
    assert.strictEqual(parsed.length, 1);
    assert.strictEqual(parsed[0].path, "src/a.ts");
    assert.strictEqual(parsed[0].hunks.length, 1);
    assert.ok(parsed[0].hunks[0].header.includes("@@"));
  });

  test("applyUnifiedDiffToText applies selected hunks", () => {
    const parsed = parseUnifiedDiff(sampleDiff);
    const original = ["const a = 1;", "export function x(){", "  return a;", "}"].join("\n");
    const next = applyUnifiedDiffToText(original, parsed[0]);
    assert.ok(next);
    assert.ok(next!.includes("const b = 2;"));
  });

  test("buildApplyPreview contains hunk metadata", () => {
    const preview = buildApplyPreview(sampleDiff);
    assert.ok(preview);
    assert.strictEqual(preview!.kind, "diff");
    assert.strictEqual(preview!.files[0], "src/a.ts");
    assert.ok(preview!.hunks.length >= 1);
  });

  test("parseWorkspaceFileBlocks supports File and Arquivo labels", () => {
    const text = [
      "File: src/a.ts",
      "```ts",
      "export const a = 1;",
      "```",
      "",
      "Arquivo: src/b.ts",
      "```ts",
      "export const b = 2;",
      "```",
    ].join("\n");
    const blocks = parseWorkspaceFileBlocks(text);
    assert.strictEqual(blocks.length, 2);
    assert.strictEqual(blocks[0].path, "src/a.ts");
    assert.strictEqual(blocks[1].path, "src/b.ts");
  });
});
