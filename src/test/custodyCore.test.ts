import * as assert from "assert";
import { suite, test } from "mocha";
import { buildCustodySignedEntry, verifyCustodySignedEntry } from "../custodyCore";

suite("Custody Core", () => {
  test("build and verify signed entry", () => {
    const payload = { type: "apply_result", chainId: "abc", files: 2 };
    const signed = buildCustodySignedEntry(payload, "GENESIS", "secret-key");
    const ok = verifyCustodySignedEntry(payload, signed, "GENESIS", "secret-key");
    assert.strictEqual(ok, true);
  });

  test("detects tampering", () => {
    const payload = { type: "apply_result", chainId: "abc", files: 2 };
    const signed = buildCustodySignedEntry(payload, "GENESIS", "secret-key");
    const tampered = { ...payload, files: 3 };
    const ok = verifyCustodySignedEntry(tampered, signed, "GENESIS", "secret-key");
    assert.strictEqual(ok, false);
  });
});
