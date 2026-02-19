import * as assert from "assert";
import { suite, test } from "mocha";
import {
  defaultPolicyConfig,
  defaultPolicyTemplateJson,
  evaluatePolicy,
  mergePolicyConfigs,
  parseExtendedPolicyFile,
  parsePolicyConfig,
} from "../policyCore";

suite("Policy Core", () => {
  test("blocks forbidden file patterns", () => {
    const cfg = defaultPolicyConfig();
    const verdict = evaluatePolicy([".env"], cfg);
    assert.strictEqual(verdict.blocked, true);
    assert.ok(verdict.matchedForbidden.includes(".env"));
  });

  test("adds risk on warning rules and large patch", () => {
    const cfg = defaultPolicyConfig();
    cfg.largePatchFiles = 2;
    cfg.largePatchRisk = 25;
    const verdict = evaluatePolicy(["package.json", "src/a.ts"], cfg);
    assert.strictEqual(verdict.blocked, false);
    assert.ok(verdict.riskScore >= 25);
  });

  test("parses custom policy json", () => {
    const raw = JSON.stringify({
      forbiddenPatterns: ["secrets/**"],
      riskThreshold: 90,
      rules: [{ pattern: "infra/**", action: "warn", risk: 40 }],
    });
    const cfg = parsePolicyConfig(raw);
    assert.strictEqual(cfg.riskThreshold, 90);
    const verdict = evaluatePolicy(["infra/main.tf"], cfg);
    assert.strictEqual(verdict.blocked, false);
    assert.ok(verdict.riskScore >= 40);
  });

  test("generates default policy template json", () => {
    const raw = defaultPolicyTemplateJson();
    const parsed = JSON.parse(raw) as { forbiddenPatterns?: string[] };
    assert.ok(Array.isArray(parsed.forbiddenPatterns));
  });

  test("domain policy can disable override", () => {
    const cfg = defaultPolicyConfig();
    const verdict = evaluatePolicy(["src/auth/session.ts"], cfg);
    assert.strictEqual(verdict.overrideAllowed, false);
    assert.ok(verdict.matchedDomains.includes("auth"));
  });

  test("domain max patch lines can block", () => {
    const cfg = defaultPolicyConfig();
    const verdict = evaluatePolicy(["migrations/001.sql"], cfg, {
      patchLinesByPath: { "migrations/001.sql": 40 },
    });
    assert.strictEqual(verdict.blocked, true);
    assert.ok(verdict.blockedBy.some((b) => b.includes("maxPatchLines")));
  });

  test("domain auto suspend blocks risky domain by history", () => {
    const cfg = defaultPolicyConfig();
    const verdict = evaluatePolicy(["infra/main.tf"], cfg, {
      domainMetrics: {
        infra: { samples: 6, rollbackRatePct: 50, validateSuccessRatePct: 40 },
      },
    });
    assert.strictEqual(verdict.blocked, true);
    assert.ok(verdict.blockedBy.some((b) => b.includes("auto_suspend")));
  });

  test("parse extended policy supports extends/imports/profiles", () => {
    const ext = parseExtendedPolicyFile(
      JSON.stringify({
        extends: ["base-policy.json"],
        imports: ["domains/security.json"],
        profiles: { strict: { riskThreshold: 55 } },
      })
    );
    assert.ok(Array.isArray(ext.extends));
    assert.ok(Array.isArray(ext.imports));
    assert.ok(ext.profiles?.strict);
  });

  test("merge policy configs applies incoming domain overrides", () => {
    const base = defaultPolicyConfig();
    const merged = mergePolicyConfigs(base, {
      domains: {
        auth: { pathPatterns: ["src/auth/**"], overrideAllowed: true },
      },
      riskThreshold: 77,
    });
    assert.strictEqual(merged.riskThreshold, 77);
    assert.deepStrictEqual(merged.domains.auth.pathPatterns, ["src/auth/**"]);
    assert.strictEqual(merged.domains.auth.overrideAllowed, true);
  });
});
