// Limites des formules (conception du paiement §11) : limitesDe (site) = share.Tier (serveur Go,
// server/internal/share/tier.go) : ouvertures, durées, plus grand palier.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTENT_MAX, MAX_OPENS, TTL_HOURS, limitesDe } from "../limits";

const GO = readFileSync(new URL("../../../server/internal/share/tier.go", import.meta.url), "utf8");

describe("limites des formules", () => {
  it("gratuit inchangé ; Plus 10 Go, 10 ouvertures, 2 et 3 jours ; Pro 30 Go, 20 ouvertures, 7 jours", () => {
    expect(limitesDe("free")).toEqual({ contentMax: CONTENT_MAX, ttlHours: TTL_HOURS, maxOpens: MAX_OPENS, palier: 0 });
    expect(limitesDe("plus")).toEqual({ contentMax: 10 * 2 ** 30, ttlHours: [1, 6, 12, 24, 48, 72], maxOpens: 10, palier: 1 });
    expect(limitesDe("pro")).toEqual({ contentMax: 30 * 2 ** 30, ttlHours: [1, 6, 12, 24, 48, 72, 168], maxOpens: 20, palier: 2 });
  });
  it("mêmes valeurs que le serveur (share.Tier)", () => {
    expect(GO).toMatch(/case Plus:\s*return 10\s*case Pro:\s*return 20/);
    expect(GO).toMatch(/case t == Plus:\s*return h == 48 \|\| h == 72\s*case t == Pro:\s*return h == 48 \|\| h == 72 \|\| h == 168/);
    expect(GO).toMatch(/PaidBuckets = \[\]int\{81921, 163841, 327681, 491521\}/);
  });
});
