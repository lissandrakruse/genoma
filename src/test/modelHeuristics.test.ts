import * as assert from "assert";
import { suite, test } from "mocha";
import {
  TimedValueCache,
  extractCloudModelsFromText,
  nextBestModel,
  pickModel,
  rankModelsByStrategy,
  scoreAnswerQuality,
} from "../modelHeuristics";

suite("Model Heuristics", () => {
  test("best_local strategy ranks coding models first", () => {
    const models = ["all-minilm:latest", "qwen3-coder:30b", "tinyllama:latest"];
    const ranked = rankModelsByStrategy(models, "best_local");
    assert.strictEqual(ranked[0], "qwen3-coder:30b");
  });

  test("fastest strategy favors tiny/small models", () => {
    const models = ["qwen3-coder:30b", "tinyllama:latest", "llama3.1:8b"];
    const ranked = rankModelsByStrategy(models, "fastest");
    assert.ok(ranked.indexOf("qwen3-coder:30b") > ranked.indexOf("llama3.1:8b"));
    assert.ok(ranked.indexOf("qwen3-coder:30b") > ranked.indexOf("tinyllama:latest"));
  });

  test("pickModel respects user_selected default model", () => {
    const models = ["qwen3-coder:30b", "llama3.1:8b"];
    const picked = pickModel("", "llama3.1:8b", models, "user_selected");
    assert.strictEqual(picked, "llama3.1:8b");
  });

  test("nextBestModel returns next ranked option", () => {
    const models = ["qwen3-coder:30b", "llama3.1:8b", "tinyllama:latest"];
    const next = nextBestModel("qwen3-coder:30b", models, "best_local");
    assert.ok(next);
    assert.notStrictEqual(next, "qwen3-coder:30b");
  });

  test("extractCloudModelsFromText parses plain and encoded models", () => {
    const text = [
      "Use qwen3-coder:480b-cloud now.",
      "https://ollama.com/library/mistral-large-3%3A675b-cloud",
      "duplicate qwen3-coder:480b-cloud",
    ].join("\n");
    const models = extractCloudModelsFromText(text);
    assert.ok(models.includes("qwen3-coder:480b-cloud"));
    assert.ok(models.includes("mistral-large-3:675b-cloud"));
    assert.strictEqual(models.filter((m) => m === "qwen3-coder:480b-cloud").length, 1);
  });

  test("scoreAnswerQuality gives higher score for structured review", () => {
    const weak = "ok";
    const strong = [
      "## Findings",
      "- High: issue",
      "- Medium: issue",
      "## Risks",
      "Assumption and tradeoff. Add tests and validation steps.",
    ].join("\n");
    assert.ok(scoreAnswerQuality(strong, "review") > scoreAnswerQuality(weak, "review"));
  });

  test("TimedValueCache expires by TTL", () => {
    const cache = new TimedValueCache<string[]>(1000);
    cache.set(["a"], 1000);
    assert.deepStrictEqual(cache.getFresh(1500), ["a"]);
    assert.strictEqual(cache.getFresh(2501), null);
  });
});
