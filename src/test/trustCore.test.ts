import * as assert from "assert";
import { suite, test } from "mocha";
import { computeDomainTrustScore, computeTrustByDomain, minTrustForDomains } from "../trustCore";

suite("Trust Core", () => {
  test("higher validation and lower rollback increase trust", () => {
    const strong = computeDomainTrustScore({ samples: 10, rollbackRatePct: 5, validateSuccessRatePct: 95 });
    const weak = computeDomainTrustScore({ samples: 10, rollbackRatePct: 50, validateSuccessRatePct: 55 });
    assert.ok(strong > weak);
  });

  test("computeTrustByDomain builds map", () => {
    const map = computeTrustByDomain({
      infra: { samples: 6, rollbackRatePct: 35, validateSuccessRatePct: 65 },
      ui: { samples: 6, rollbackRatePct: 5, validateSuccessRatePct: 90 },
    });
    assert.ok(Number.isFinite(map.infra));
    assert.ok(Number.isFinite(map.ui));
  });

  test("minTrustForDomains returns minimum across matched domains", () => {
    const min = minTrustForDomains(["infra", "ui"], { infra: 40, ui: 85 });
    assert.strictEqual(min, 40);
  });
});
