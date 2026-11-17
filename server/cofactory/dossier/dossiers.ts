import { randomUUID } from "node:crypto";

import { DEFAULT_DOSSIER_POLICY, type Dossier, type DossierBody, type DossierPolicy } from "../../../shared/cofactory/dossier.ts";
import type { DiscoveryStore } from "../discovery/store.ts";
import type { NicheRegistry } from "../discovery/registry.ts";
import type { Truth } from "../truth/store.ts";
import { interrogate } from "./qa.ts";
import { preScore, scoreDossier } from "./score.ts";
import { verifyDossier } from "./verify.ts";

type Refusal = { ok: false; reason: string };

export interface DossierDeps {
  store: DiscoveryStore;
  truth: Truth;
  registry: NicheRegistry;
  policy?: Partial<DossierPolicy>;
  now?: () => number;
  /** At or above this similarity, a niche another factory holds vetoes this one at scoring time. */
  crossFactoryBlock?: number;
}

/** The expensive filter: selection from a closed batch, dossiers checked against the world, scoring and the shortlist. */
export function createDossiers(deps: DossierDeps) {
  const { store, truth, registry } = deps;
  const policy: DossierPolicy = { ...DEFAULT_DOSSIER_POLICY, ...deps.policy };
  const now = deps.now ?? Date.now;
  const block = deps.crossFactoryBlock ?? 0.6;

  /** The strongest candidates of a closed batch become `selected`; the rest wait as candidates. */
  function select(batchId: string): string[] {
    const candidates = store.niches({ batchId }).filter((niche) => niche.status === "candidate");
    if (store.niches({ batchId }).some((niche) => niche.status !== "candidate" && niche.status !== "rejected")) return [];
    const killed = store.postmortems();
    const ranked = candidates.map((niche) => ({ niche, rank: preScore(niche, niche.signalIds.map((id) => store.signal(id)).filter((signal) => signal !== null), killed) }))
      .sort((a, b) => b.rank - a.rank).slice(0, policy.dossiersPerBatch);
    for (const { niche } of ranked) store.setNicheStatus(niche.id, "selected");
    return ranked.map(({ niche }) => niche.id);
  }

  /** Recomputes a batch's shortlist from the newest dossiers: the best clean scores, plus any champion. A shortlisted niche's
   * registry claim goes live, so no other factory can take it from here on. */
  function reshortlist(batchId: string | null): void {
    const inBatch = new Set(store.niches(batchId ? { batchId } : {}).map((niche) => niche.id));
    const latest = store.latestDossiers().filter((dossier) => inBatch.has(dossier.nicheId));
    const clean = latest.filter((dossier) => (dossier.status === "scored" || dossier.status === "shortlisted") && dossier.score && !dossier.score.vetoes.length)
      .sort((a, b) => b.score!.score - a.score!.score);
    clean.forEach((dossier, index) => {
      const shortlisted = index < policy.shortlistSize;
      store.setDossierStatus(dossier.id, shortlisted ? "shortlisted" : "scored");
      store.setNicheStatus(dossier.nicheId, shortlisted ? "shortlisted" : "selected");
      if (shortlisted) registry.promote(dossier.nicheId);
    });
    for (const dossier of latest.filter((candidate) => candidate.status === "championed")) {
      store.setNicheStatus(dossier.nicheId, "shortlisted");
      registry.promote(dossier.nicheId);
    }
  }

  async function submit(nicheId: string, body: DossierBody): Promise<{ ok: true; dossier: Dossier } | Refusal> {
    const niche = store.niche(nicheId);
    if (!niche) return { ok: false, reason: "no such niche" };
    if (!["selected", "shortlisted"].includes(niche.status)) return { ok: false, reason: `the niche is ${niche.status}; only a selected niche gets a dossier` };
    const version = (store.dossiersOf(nicheId).at(-1)?.version ?? 0) + 1;
    const id = randomUUID();
    const verification = await verifyDossier(truth, body, policy, `dossier:${nicheId}`);
    const qa = interrogate(`${nicheId}:${version}`, body, verification, policy);
    const taken = registry.nearest(niche, niche.factoryId, 50).find((claim) => claim.similarity >= block && claim.level === "live");
    const score = scoreDossier({ niche, body, verification, qa, policy, takenBy: taken ? taken.factoryId.slice(0, 8) : null });
    const hardFail = !verification.pass || !qa.pass;
    const dossier: Dossier = {
      id, nicheId, factoryId: niche.factoryId, version, at: now(), body, verification, qa, score,
      status: hardFail ? "failed" : score.vetoes.length ? "dropped" : "scored", champion: null,
    };
    store.addDossier(dossier);
    if (dossier.status === "dropped") store.setNicheStatus(nicheId, "rejected");
    reshortlist(niche.batchId);
    return { ok: true, dossier: store.dossier(id)! };
  }

  /** One champion with cited evidence can advance a clean dossier the score left off the shortlist; scores are never averaged. */
  function champion(dossierId: string, by: string, why: string, evidence: string[]): { ok: true; dossier: Dossier } | Refusal {
    const dossier = store.dossier(dossierId);
    if (!dossier) return { ok: false, reason: "no such dossier" };
    const latest = store.dossiersOf(dossier.nicheId).at(-1)!;
    if (latest.id !== dossier.id) return { ok: false, reason: "champion the newest version of the dossier" };
    if (dossier.status === "shortlisted" || dossier.status === "championed") return { ok: false, reason: `the dossier is already ${dossier.status}` };
    if (dossier.status !== "scored") return { ok: false, reason: `a ${dossier.status} dossier cannot be championed: ${dossier.score?.vetoes.map((item) => item.why).join("; ") || "it did not verify"}` };
    if (why.trim().length < 60) return { ok: false, reason: "say specifically what the score misses" };
    const cited = evidence.filter((ref) => store.signal(ref) || dossier.verification.claims.some((claim) => String(claim.checkId) === ref && claim.verdict === "verified"));
    if (!cited.length) return { ok: false, reason: "cite at least one verified signal id or claim check id" };
    store.setDossierStatus(dossierId, "championed", { by, why: why.trim(), evidence: cited });
    reshortlist(store.niche(dossier.nicheId)?.batchId ?? null);
    return { ok: true, dossier: store.dossier(dossierId)! };
  }

  /** The owner or lead picks niches for dossiers by hand, from any candidate, or gives a rejected one another go. */
  function selectNiches(nicheIds: string[]): string[] {
    const picked = nicheIds.filter((id) => ["candidate", "rejected"].includes(store.niche(id)?.status ?? ""));
    for (const id of picked) store.setNicheStatus(id, "selected");
    return picked;
  }

  return {
    policy,
    select,
    selectNiches,
    submit,
    champion,
    latest: (nicheId: string) => store.dossiersOf(nicheId).at(-1) ?? null,
    /** Selected niches that still need a passing dossier, oldest first. */
    wanted(): string[] {
      return store.niches().filter((niche) => niche.status === "selected" && !store.dossiersOf(niche.id).some((dossier) => dossier.status !== "failed")).map((niche) => niche.id);
    },
    board(): Array<{ niche: { id: string; buyer: string; job: string; status: string }; dossier: Pick<Dossier, "id" | "version" | "status" | "score" | "champion"> & { verifiedShare: number; qaUnknown: number } | null }> {
      return store.niches().filter((niche) => niche.status !== "candidate").map((niche) => {
        const latest = store.dossiersOf(niche.id).at(-1);
        return {
          niche: { id: niche.id, buyer: niche.buyer, job: niche.job, status: niche.status },
          dossier: latest ? { id: latest.id, version: latest.version, status: latest.status, score: latest.score, champion: latest.champion, verifiedShare: latest.verification.verifiedShare, qaUnknown: latest.qa.unknown } : null,
        };
      });
    },
  };
}

export type Dossiers = ReturnType<typeof createDossiers>;
