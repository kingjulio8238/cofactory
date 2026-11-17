import { randomUUID } from "node:crypto";

import {
  BUYER_VOICE_SOURCES,
  DEFAULT_DISCOVERY_POLICY,
  PROFILE_FIELDS,
  type DiscoveryBatch,
  type DiscoveryPolicy,
  type FactoryProfile,
  type Niche,
  type ProfileField,
  type Signal,
  type SignalKind,
  type SourceType,
} from "../../../shared/cofactory/discovery.ts";
import type { Truth } from "../truth/store.ts";
import { normalizeForMatch } from "../truth/text.ts";
import type { NicheRegistry } from "./registry.ts";
import { nicheSimilarity } from "./similarity.ts";
import type { DiscoveryStore } from "./store.ts";

type Refusal = { ok: false; reason: string };

/** The site a page belongs to, so two pages of one forum count as one source. */
export function siteOf(url: string): string {
  let host: string;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return url; }
  const parts = host.split(".");
  const countrySecondLevel = parts.length > 2 && parts.at(-1)!.length === 2 && /^(co|com|org|gov|ac|net|edu)$/.test(parts.at(-2)!);
  return parts.slice(countrySecondLevel ? -3 : -2).join(".");
}

export interface DiscoveryDeps {
  store: DiscoveryStore;
  truth: Truth;
  registry: NicheRegistry;
  policy?: Partial<DiscoveryPolicy>;
  now?: () => number;
}

/** Discovery's rules in code: signals only on verified quotes, niches only on independent signals and the factory's own inputs. */
export function createDiscovery(deps: DiscoveryDeps) {
  const { store, truth, registry } = deps;
  const policy: DiscoveryPolicy = { ...DEFAULT_DISCOVERY_POLICY, ...deps.policy };
  const now = deps.now ?? Date.now;

  function setProfile(input: { inputs: Array<{ field: ProfileField; text: string }>; constraints?: string[]; seedNiches?: string[] }): { ok: true; profile: FactoryProfile } | Refusal {
    const inputs = input.inputs.map((item) => ({ field: item.field, text: item.text.trim() })).filter((item) => item.text && PROFILE_FIELDS.includes(item.field));
    if (inputs.length < policy.minProfileInputs) return { ok: false, reason: `a profile needs at least ${policy.minProfileInputs} inputs that are the owner's own` };
    const existing = store.profile();
    const keep = new Map((existing?.inputs ?? []).map((item) => [`${item.field}:${item.text.toLowerCase()}`, item.id]));
    const profile: FactoryProfile = {
      factoryId: existing?.factoryId ?? randomUUID(),
      inputs: inputs.map((item) => ({ id: keep.get(`${item.field}:${item.text.toLowerCase()}`) ?? `in-${randomUUID().slice(0, 8)}`, ...item })),
      constraints: (input.constraints ?? []).map((item) => item.trim()).filter(Boolean),
      seedNiches: (input.seedNiches ?? []).map((item) => item.trim()).filter(Boolean),
      updatedAt: now(),
    };
    store.setProfile(profile);
    return { ok: true, profile };
  }

  function startBatch(note: string, target = policy.batchTarget): { ok: true; batch: DiscoveryBatch } | Refusal {
    const profile = store.profile();
    if (!profile) return { ok: false, reason: "set the factory profile first" };
    const open = store.openBatch();
    if (open) return { ok: false, reason: `batch ${open.id.slice(0, 8)} is still open` };
    const batch: DiscoveryBatch = { id: randomUUID(), factoryId: profile.factoryId, startedAt: now(), closedAt: null, target, note };
    store.addBatch(batch);
    return { ok: true, batch };
  }

  /** Stores a signal only when its quote is on its page; a repeat of the same quote returns the stored one. */
  async function recordSignal(input: { url: string; quote: string; kind: SignalKind; sourceType: SourceType; buyerHint: string; jobHint: string }): Promise<{ ok: true; signal: Signal; duplicate: boolean; checkId: number } | (Refusal & { checkId?: number })> {
    const profile = store.profile();
    if (!profile) return { ok: false, reason: "set the factory profile first" };
    const quote = input.quote.trim();
    if (quote.split(/\s+/).length < 6) return { ok: false, reason: "quote at least six words, verbatim from the page" };
    const norm = normalizeForMatch(quote);
    const existing = store.signalByQuote(input.url, norm);
    if (existing) return { ok: true, signal: existing, duplicate: true, checkId: existing.claimCheckId };
    const check = await truth.checkClaim({ url: input.url, quote, subject: `factory:${profile.factoryId}` });
    if (check.verdict !== "verified") return { ok: false, reason: `quote is ${check.verdict}: ${check.reason}`, checkId: check.checkId! };
    const signal: Signal = {
      id: randomUUID(), factoryId: profile.factoryId, batchId: store.openBatch()?.id ?? null, at: now(), url: input.url, site: siteOf(input.url), quote,
      kind: input.kind, sourceType: input.sourceType, buyerHint: input.buyerHint.trim(), jobHint: input.jobHint.trim(), claimCheckId: check.checkId!, snapshotId: check.snapshotId,
    };
    store.addSignal(signal, norm);
    return { ok: true, signal, duplicate: false, checkId: check.checkId! };
  }

  /** Checks a proposed niche against every rule and, if it passes, stores it and soft-claims it in the registry. */
  function proposeNiche(input: { buyer: string; job: string; channel: string; whyGap: string; signalIds: string[]; uniqueInputIds: string[]; boring: boolean; crossField: boolean }): { ok: true; niche: Niche } | Refusal {
    const profile = store.profile();
    if (!profile) return { ok: false, reason: "set the factory profile first" };
    const key = { buyer: input.buyer.trim(), job: input.job.trim(), channel: input.channel.trim() };
    if (!key.buyer || !key.job || !key.channel) return { ok: false, reason: "a niche names one buyer, one job and one channel" };
    if (input.whyGap.trim().length < 40) return { ok: false, reason: "say precisely what incumbents miss and why the gap exists" };
    const signals = [...new Set(input.signalIds)].map((id) => store.signal(id));
    const missing = input.signalIds.filter((_, index) => !signals[index]);
    if (missing.length) return { ok: false, reason: `no verified signal ${missing[0]}` };
    const found = signals as Signal[];
    const sites = new Set(found.map((signal) => signal.site));
    const types = new Set(found.map((signal) => signal.sourceType));
    if (found.length < policy.minSignals) return { ok: false, reason: `a niche rests on at least ${policy.minSignals} verified signals (got ${found.length})` };
    if (sites.size < policy.minSites) return { ok: false, reason: `its signals must come from at least ${policy.minSites} different sites (got ${sites.size}: ${[...sites].join(", ")})` };
    if (types.size < policy.minSourceTypes) return { ok: false, reason: `its signals must come from at least ${policy.minSourceTypes} kinds of source (got ${[...types].join(", ")})` };
    if (found.filter((signal) => BUYER_VOICE_SOURCES.includes(signal.sourceType)).length < policy.minBuyerVoice) {
      return { ok: false, reason: `at least ${policy.minBuyerVoice} signal must be buyers in their own words (a ${BUYER_VOICE_SOURCES.join(", ")} page); news, vendors and regulators describe demand, they do not show it` };
    }
    const inputIds = new Set(profile.inputs.map((item) => item.id));
    const cited = input.uniqueInputIds.filter((id) => inputIds.has(id));
    if (!cited.length) return { ok: false, reason: `cite at least one of the owner's inputs by id: ${profile.inputs.map((item) => `${item.id} (${item.field}: ${item.text})`).join("; ")}` };
    const own = store.niches().filter((niche) => niche.status !== "rejected" && niche.status !== "released")
      .map((niche) => ({ niche, similarity: nicheSimilarity(key, niche) })).sort((a, b) => b.similarity - a.similarity)[0];
    if (own && own.similarity >= policy.ownDuplicate) return { ok: false, reason: `duplicates this factory's niche "${own.niche.buyer} · ${own.niche.job}"` };
    const others = registry.nearest(key, profile.factoryId, 50);
    const blocked = others.find((claim) => claim.similarity >= policy.crossFactoryBlock);
    if (blocked) return { ok: false, reason: "another factory already holds this niche; find one only this factory would find" };
    const niche: Niche = {
      id: randomUUID(), factoryId: profile.factoryId, batchId: store.openBatch()?.id ?? null, at: now(), ...key, whyGap: input.whyGap.trim(),
      signalIds: found.map((signal) => signal.id), uniqueInputIds: cited, boring: input.boring, crossField: input.crossField, status: "candidate",
      density: others.filter((claim) => claim.similarity >= policy.densityRadius).length,
    };
    store.addNiche(niche);
    registry.claim({ nicheId: niche.id, factoryId: profile.factoryId, ...key, level: "candidate", at: now() });
    return { ok: true, niche };
  }

  /** How a batch stands against its target and its quotas. */
  function batchStatus(batchId?: string) {
    const batch = batchId ? store.batches().find((candidate) => candidate.id === batchId) ?? null : store.openBatch() ?? store.batches().at(-1) ?? null;
    if (!batch) return null;
    const niches = store.niches({ batchId: batch.id });
    const signals = store.signals({ batchId: batch.id });
    const share = (count: number) => (niches.length ? count / niches.length : 0);
    const boring = niches.filter((niche) => niche.boring).length;
    const crossField = niches.filter((niche) => niche.crossField).length;
    const short: string[] = [];
    if (niches.length < batch.target) short.push(`${batch.target - niches.length} more niches`);
    if (share(boring) < policy.boringShare) short.push(`boring share ${Math.round(share(boring) * 100)}% < ${policy.boringShare * 100}%`);
    if (share(crossField) < policy.crossFieldShare) short.push(`cross-field share ${Math.round(share(crossField) * 100)}% < ${policy.crossFieldShare * 100}%`);
    return {
      batch, niches: niches.length, signals: signals.length, sites: new Set(signals.map((signal) => signal.site)).size,
      boringShare: share(boring), crossFieldShare: share(crossField), complete: short.length === 0, short,
    };
  }

  return {
    policy,
    store,
    setProfile,
    profile: () => store.profile(),
    startBatch,
    recordSignal,
    proposeNiche,
    batchStatus,
    /** Ends the open batch however short it is; its niches stay as they are. */
    abandonBatch(): { ok: true; status: NonNullable<ReturnType<typeof batchStatus>> } | Refusal {
      const open = store.openBatch();
      if (!open) return { ok: false, reason: "no batch is open" };
      store.closeBatch(open.id, now());
      return { ok: true, status: batchStatus(open.id)! };
    },
    closeBatch(): { ok: true; status: NonNullable<ReturnType<typeof batchStatus>> } | Refusal {
      const open = store.openBatch();
      if (!open) return { ok: false, reason: "no batch is open" };
      const status = batchStatus(open.id)!;
      if (!status.complete) return { ok: false, reason: `the batch is short: ${status.short.join("; ")}` };
      store.closeBatch(open.id, now());
      return { ok: true, status: batchStatus(open.id)! };
    },
  };
}

export type Discovery = ReturnType<typeof createDiscovery>;
