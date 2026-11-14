// Couche HTTP du compte (conception compte §8.6, §21.6.2) : routes /api/compte/* seulement, jeton
// de session dans X-Shh-Session et nulle part ailleurs (§8.5), aucun secret dans l'URL, aucune
// requête vers /api/shares, /api/manage ni /api/salons.
import { describe, expect, it } from "vitest";
import * as A from "./api";
import { b64u } from "../engine/pure";

type Seen = { method: string; url: string; headers: Record<string, string>; body: unknown; init: RequestInit };

const B = (n: number, v = 1) => new Uint8Array(n).fill(v);
const S = (n: number, v = 1) => b64u(B(n, v));
const JETON = S(32, 9);
const OUV = { session: S(32, 2), h: S(16, 3), env_mdp: S(60, 4), s_profil: S(32, 5), blob_profil: S(4141, 6), gen_profil: 1, blob_prive: S(4141, 7), gen_prive: 2 };

function net(reply: (s: Seen) => Response | Promise<Response>) {
  const seen: Seen[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    const s: Seen = { method: init.method ?? "GET", url, headers: { ...(init.headers as Record<string, string>) }, body: init.body === undefined ? undefined : JSON.parse(init.body as string), init };
    seen.push(s);
    return reply(s);
  }) as unknown as typeof globalThis.fetch;
  return { n: { origin: "https://shh.test", fetch } as A.Net, seen };
}
const ok = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json" } });

/** Chaque fonction de l'API, avec la réponse que le serveur donne. */
const CALLS: [string, (n: A.Net) => Promise<unknown>, unknown][] = [
  ["inscriptionDebut", (n) => A.inscriptionDebut(n, { email: "a@b.fr", langue: "fr", altcha: "x", hp: "", shown_at: "t" }), { h: S(16), etape: S(32) }],
  ["inscriptionRenvoyer", (n) => A.inscriptionRenvoyer(n, S(32), "a@b.fr"), {}],
  ["inscriptionFin", (n) => A.inscriptionFin(n, { etape: S(32), code: "123456", aAuth: B(32), envMdp: B(60), sProfil: B(32), pCanon: "lea", blobProfil: B(4141), blobPrive: B(4141), persistante: false, etiquette: B(64) }), { session: S(32) }],
  ["connexion", (n) => A.connexion(n, { email: "a@b.fr", aAuth: B(32), persistante: true, etiquette: null }), OUV],
  ["connexionTotp", (n) => A.connexionTotp(n, S(32), "123456"), OUV],
  ["oubliDebut", (n) => A.oubliDebut(n, { email: "a@b.fr", langue: "en", altcha: "x", hp: "", shown_at: "t" }), { etape: S(32) }],
  ["oubliRenvoyer", (n) => A.oubliRenvoyer(n, S(32), "a@b.fr"), {}],
  ["oubliVerifier", (n) => A.oubliVerifier(n, { etape: S(32), code: "123456", totp: "", totpPerdu: false }), { h: S(16), gen_prive: 4 }],
  ["oubliFin", (n) => A.oubliFin(n, { etape: S(32), aAuth: B(32), envMdp: B(60), blobPrive: B(4141), persistante: false, etiquette: B(64) }), { session: S(32), h: S(16), s_profil: S(32), blob_profil: S(4141), gen_profil: 1, gen_prive: 5 }],
  ["lireCoffre", (n) => A.lireCoffre(n, JETON, "prive"), { blob: S(4141), gen: 3 }],
  ["ecrireCoffre", (n) => A.ecrireCoffre(n, JETON, "profil", 3, B(4141)), { gen: 4 }],
  ["pseudoVerifier", (n) => A.pseudoVerifier(n, { jeton: JETON }, "lea"), { libre: true }],
  ["pseudoVerifier (étape)", (n) => A.pseudoVerifier(n, { etape: S(32) }, "lea"), { libre: false }],
  ["changerPseudo", (n) => A.changerPseudo(n, JETON, "lea"), {}],
  ["deconnexion", (n) => A.deconnexion(n, JETON), {}],
];

describe("routes et en-têtes", () => {
  it("toutes les requêtes vont à /api/compte*, sans cookie, sans redirection, rien dans l'URL", async () => {
    for (const [name, call, res] of CALLS) {
      const { n, seen } = net(() => ok(res, name === "inscriptionFin" ? 201 : 200));
      await call(n);
      expect(seen.length, name).toBe(1);
      const s = seen[0]!;
      expect(s.url, name).toMatch(/^https:\/\/shh\.test\/api\/compte(\/[a-z/]+)?$/);
      expect(s.url, name).not.toMatch(/\/api\/(shares|manage|salons)/);
      expect(s.init.credentials, name).toBe("omit");
      expect(s.init.redirect, name).toBe("error");
      expect(s.url, name).not.toContain("?");
    }
  });

  it("X-Shh-Session seulement sur les routes de session, avec le jeton exact", async () => {
    const withSession = new Set(["lireCoffre", "ecrireCoffre", "pseudoVerifier", "changerPseudo", "deconnexion"]);
    for (const [name, call, res] of CALLS) {
      const { n, seen } = net(() => ok(res));
      await call(n);
      const h = seen[0]!.headers;
      if (withSession.has(name)) expect(h["X-Shh-Session"], name).toBe(JETON);
      else expect(Object.keys(h).filter((k) => k.toLowerCase() === "x-shh-session"), name).toEqual([]);
    }
  });

  it("corps exacts (clés du serveur, base64url sans bourrage, aucun null)", async () => {
    const bodies: Record<string, unknown> = {};
    for (const [name, call, res] of CALLS) {
      const { n, seen } = net(() => ok(res));
      await call(n);
      bodies[name] = seen[0]!.body;
      expect(JSON.stringify(seen[0]!.body ?? {}), name).not.toContain("null");
      expect(JSON.stringify(seen[0]!.body ?? {}), name).not.toContain("=");
    }
    expect(Object.keys(bodies.inscriptionFin as object)).toEqual(["etape", "code", "a_auth", "env_mdp", "s_profil", "p_canon", "blob_profil", "blob_prive", "persistante", "etiquette"]);
    expect(bodies.connexion).toEqual({ email: "a@b.fr", a_auth: S(32), persistante: true, etiquette: "" });
    expect(bodies.oubliVerifier).toEqual({ etape: S(32), code: "123456", totp: "", totp_perdu: false });
    expect(bodies.ecrireCoffre).toEqual({ if_gen: 3, blob: S(4141) });
    expect(bodies["pseudoVerifier (étape)"]).toEqual({ etape: S(32), p_canon: "lea" });
    expect(bodies.deconnexion).toEqual({});
    expect(bodies.lireCoffre).toBeUndefined();
  });

  it("connexion avec preuve ALTCHA : les trois champs ensemble", async () => {
    const { n, seen } = net(() => ok(OUV));
    await A.connexion(n, { email: "a@b.fr", aAuth: B(32), persistante: false, etiquette: null, preuve: { altcha: "p", hp: "", shown_at: "t" } });
    expect(seen[0]!.body).toEqual({ email: "a@b.fr", a_auth: S(32), persistante: false, etiquette: "", altcha: "p", hp: "", shown_at: "t" });
  });
});

describe("réponses", () => {
  it("connexion : ouverture décodée, ou étape TOTP", async () => {
    const o = (await A.connexion(net(() => ok(OUV)).n, { email: "a", aAuth: B(32), persistante: false, etiquette: null })) as A.Ouverture;
    expect(o.envMdp).toEqual(B(60, 4));
    expect(o.sProfil).toEqual(B(32, 5));
    expect(o.h).toEqual(B(16, 3));
    expect(o.genPrive).toBe(2);
    const t = await A.connexion(net(() => ok({ totp_requis: true, etape: S(32) })).n, { email: "a", aAuth: B(32), persistante: false, etiquette: null });
    expect(t).toEqual({ totp: S(32) });
  });

  it("oubli/verifier : { h, gen_prive } ou { attente_jusqu }", async () => {
    const call = (r: unknown) => A.oubliVerifier(net(() => ok(r)).n, { etape: S(32), code: "1", totp: "", totpPerdu: true });
    expect(await call({ h: S(16), gen_prive: 4 })).toEqual({ h: B(16), genPrive: 4 });
    expect(await call({ attente_jusqu: "2026-11-21" })).toEqual({ attenteJusqu: "2026-11-21" });
    await expect(call({ h: S(16) })).rejects.toThrow("reponse_invalide");
  });

  it("réponse mal formée (taille, type) : reponse_invalide", async () => {
    await expect(A.connexion(net(() => ok({ ...OUV, env_mdp: S(59) })).n, { email: "a", aAuth: B(32), persistante: false, etiquette: null })).rejects.toThrow("reponse_invalide");
    await expect(A.lireCoffre(net(() => ok({ blob: S(10), gen: "3" })).n, JETON, "prive")).rejects.toThrow("reponse_invalide");
    await expect(A.inscriptionDebut(net(() => new Response("pas du json")).n, { email: "a", langue: "fr", altcha: "", hp: "", shown_at: "" })).rejects.toThrow("reponse_invalide");
  });

  it("erreurs du serveur : code, essais restants, date, gen, Retry-After", async () => {
    const err = async (r: Response) => {
      try {
        await A.lireCoffre(net(() => r).n, JETON, "prive");
      } catch (e) {
        return e as A.CompteError;
      }
      throw new Error("pas d'erreur");
    };
    const cf = await err(ok({ error: "code_faux", attempts_left: 3 }, 403));
    expect([cf.status, cf.code, cf.attemptsLeft]).toEqual([403, "code_faux", 3]);
    expect(cf).toBeInstanceOf(A.CompteError);
    expect((await err(ok({ error: "attente", jusqu: "2026-11-21" }, 403))).jusqu).toBe("2026-11-21");
    expect((await err(ok({ error: "conflict", gen: 7 }, 409))).gen).toBe(7);
    const lim = await err(new Response(JSON.stringify({ error: "limit" }), { status: 429, headers: { "Retry-After": "120" } }));
    expect([lim.code, lim.retryAfterS]).toEqual(["limit", 120]);
    expect((await err(new Response("", { status: 401 }))).code).toBe("http_401");
    expect((await err(ok({ error: "session" }, 401))).code).toBe("session");
  });

  it("coupure réseau : Error(\"reseau\"), sans nouvel essai", async () => {
    let n = 0;
    const f = (async () => (n++, Promise.reject(new TypeError("failed")))) as unknown as typeof fetch;
    await expect(A.deconnexion({ origin: "https://shh.test", fetch: f }, JETON)).rejects.toThrow("reseau");
    expect(n).toBe(1);
  });
});
