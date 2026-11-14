// @vitest-environment happy-dom
// Vue de gestion `#m…` et historique (test d'intrusion du 11 novembre) : un partage détruit ou
// relu depuis `#m…` met à jour son entrée d'historique si elle existe ; aucune entrée n'est
// créée, et une simple visite ne crée pas d'historique.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeIndexedDB, type FakeIdb } from "./fake-idb.test-helper";

const MANAGE = "https://x.test/#m" + "A".repeat(43);
const OTHER = "https://x.test/#m" + "B".repeat(43);
let idb: FakeIdb;
let live: typeof import("./live.svelte");

beforeEach(async () => {
  vi.resetModules();
  idb = fakeIndexedDB();
  vi.stubGlobal("indexedDB", idb);
  live = await import("./live.svelte");
});
afterEach(() => vi.unstubAllGlobals());

async function seed(manage = MANAGE) {
  const now = Date.now();
  await live.recordShare({ manage, createdAt: now - 60_000, sizeBytes: 10, itemsCount: 1, expiresAt: now + 3600_000, maxOpens: 3 });
  return live.shares.entries.find((e) => e.manage === manage)!;
}

describe("syncManaged : #m… → entrée d'historique existante", () => {
  it("destruction réussie : l'entrée passe à « détruit ici » ; l'autre ne bouge pas", async () => {
    await seed();
    const other = await seed(OTHER);
    await live.syncManaged(MANAGE, { kind: "destroyed" });
    const e = live.shares.entries.find((x) => x.manage === MANAGE)!;
    expect(e.state).toBe("gone");
    expect(e.destroyedHere).toBe(true);
    expect(e.endedAt).toBeGreaterThan(0);
    expect(live.shares.entries.find((x) => x.id === other.id)).toEqual(other);
  });

  it("relecture : ouvertures, échéance et état mis à jour (ouverture notée entre deux relectures)", async () => {
    const before = await seed();
    await live.syncManaged(MANAGE, { kind: "status", status: { opensUsed: 2, maxOpens: 3, expiresInS: 1800, state: "draining" } });
    const e = live.shares.entries.find((x) => x.id === before.id)!;
    expect(e.opensUsed).toBe(2);
    expect(e.state).toBe("draining");
    expect(e.opens).toHaveLength(1);
    expect(e.opens[0]!.count).toBe(2);
    expect(Math.abs(e.expiresAt - (Date.now() + 1800_000))).toBeLessThan(5_000);
    expect(e.lastSeenAt).toBeGreaterThan(before.lastSeenAt);
  });

  it("partage absent du serveur : « terminé », pas « détruit ici »", async () => {
    await seed();
    await live.syncManaged(MANAGE, { kind: "missing" });
    const e = live.shares.entries[0]!;
    expect(e.state).toBe("gone");
    expect(e.destroyedHere).toBe(false);
  });

  it("aucune entrée correspondante : rien n'est créé", async () => {
    await seed(OTHER);
    await live.syncManaged(MANAGE, { kind: "destroyed" });
    expect(live.shares.entries.map((e) => e.manage)).toEqual([OTHER]);
    expect(live.shares.entries[0]!.state).toBe("ready");
  });

  it("aucun historique encore : rien n'est écrit dans le navigateur", async () => {
    await live.syncManaged(MANAGE, { kind: "destroyed" });
    await live.syncManaged(MANAGE, { kind: "status", status: { opensUsed: 0, maxOpens: 1, expiresInS: 60, state: "ready" } });
    expect(idb.raw().size).toBe(0);
  });

  it("même partage, lien de gestion sous une autre base (démo /shhdrop/) : reconnu", async () => {
    await seed("https://x.test/shhdrop/#m" + "A".repeat(43));
    await live.syncManaged(MANAGE, { kind: "destroyed" });
    expect(live.shares.entries[0]!.state).toBe("gone");
  });
});

describe("syncManaged : ordre", () => {
  it("relecture reportée pendant l'écriture d'une destruction : l'entrée reste « détruit ici »", async () => {
    await seed();
    const b = live.syncManaged(MANAGE, { kind: "destroyed" });
    const a = live.syncManaged(MANAGE, { kind: "status", status: { opensUsed: 1, maxOpens: 3, expiresInS: 600, state: "ready" } });
    await Promise.all([a, b]);
    expect(live.shares.entries[0]!.state).toBe("gone");
    expect(live.shares.entries[0]!.destroyedHere).toBe(true);
  });
});

describe("revue D42-22 : « Effacer l'historique » efface aussi les retours gardés", () => {
  it("la base shhdrop-returns disparaît avec l'historique", async () => {
    await seed();
    const { pageReturns, RETURNS_DB } = await import("./returns");
    await pageReturns().save({ tag: "T".repeat(22), grant: "G".repeat(54), expiresAt: Date.now() + 3600_000 });
    expect(idb.raw().has(RETURNS_DB)).toBe(true);
    await live.clearHistory();
    expect(idb.raw().has(RETURNS_DB)).toBe(false);
  });
});

describe("relecture (A) : « Effacer l'historique » ne se bloque jamais sur les retours", () => {
  it("historique effacé d'abord ; retours bloqués (base tenue ailleurs) : fini au plus tard 2 s après", async () => {
    await seed();
    const { pageReturns } = await import("./returns");
    vi.spyOn(pageReturns(), "clear").mockReturnValue(new Promise<void>(() => undefined));
    vi.useFakeTimers();
    try {
      let done = false;
      const p = live.clearHistory().then(() => (done = true));
      await vi.advanceTimersByTimeAsync(100);
      expect(live.shares.entries).toEqual([]); // l'historique n'attend pas les retours
      await vi.advanceTimersByTimeAsync(2000);
      await p;
      expect(done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

// Conception compte §21.7, §21.8 (plan, lot 11) : partages reçus gardés sur l'appareil (lien,
// jamais le mot de passe), retirés par « Oublier ce partage sur cet appareil » ; « Vos envois »
// (shares.entries) ne voit que les envois ; entrées du compte importées et retirées à la
// déconnexion ; chaque ajout ou retrait local est signalé (synchronisation du compte).
describe("partages reçus (lot 11)", () => {
  const KEY = "k".repeat(43);
  const LINK = "https://x.test/#" + KEY;
  const received = () => ({ link: LINK, expiresAt: Date.now() + 3600_000, itemsCount: 2, sizeBytes: 300, format: "image" });

  it("recordReceived : entrée « recu » locale dans shares.all, jamais dans shares.entries (envois)", async () => {
    await seed();
    await live.recordReceived(received());
    expect(live.shares.entries.map((e) => e.sorte)).toEqual(["envoi"]);
    const r = live.shares.all.find((e) => e.sorte === "recu")!;
    expect(r).toMatchObject({ link: LINK, origine: "local", itemsCount: 2, sizeBytes: 300, format: "image", manage: "" });
    expect(live.shares.all).toHaveLength(2);
  });

  it("forgetReceived(clé) : l'entrée de ce lien part, les autres restent", async () => {
    await seed();
    await live.recordReceived(received());
    await live.forgetReceived(KEY);
    expect(live.shares.all.map((e) => e.sorte)).toEqual(["envoi"]);
  });

  it("chaque ajout ou retrait local est signalé ; importer() n'est pas signalé (venu du compte)", async () => {
    const seen: string[] = [];
    const stop = live.onLocalChange((c) => seen.push(`${c.kind}:${c.entry.sorte}`));
    await seed();
    await live.recordReceived(received());
    await live.forgetReceived(KEY);
    const env = live.shares.entries[0]!;
    await live.forgetShare(env.id);
    await live.importEntries([{ ...env, id: "C".repeat(22), origine: "compte" }]);
    stop();
    await live.recordReceived(received());
    expect(seen).toEqual(["add:envoi", "add:recu", "remove:recu", "remove:envoi"]);
    expect(live.shares.entries.map((e) => e.origine)).toEqual(["compte"]);
  });

  it("dropAccountEntries : seules les entrées venues du compte partent ; celles de l'appareil restent", async () => {
    const env = await seed();
    await live.importEntries([{ ...env, id: "C".repeat(22), origine: "compte", manage: OTHER }]);
    expect(live.shares.entries).toHaveLength(2);
    await live.dropAccountEntries();
    expect(live.shares.entries.map((e) => e.id)).toEqual([env.id]);
  });
});
