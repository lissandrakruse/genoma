import * as assert from "assert";
import { suite, test } from "mocha";
import { isActionAllowedForMode } from "../actionRules";

suite("Ollama Copilot - Unit Suite", () => {
  test("Action validation by mode", () => {
    assert.ok(isActionAllowedForMode("devops", "infra_ps"));
    assert.ok(isActionAllowedForMode("devds", "sql"));
    assert.ok(!isActionAllowedForMode("code", "infra_ps"));
    assert.ok(!isActionAllowedForMode("pbi", "fix"));
  });

  test("Sample sanity test", () => {
    assert.strictEqual(-1, [1, 2, 3].indexOf(5));
  });
});
