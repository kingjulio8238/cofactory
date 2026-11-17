import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ProfileField, Signal, SignalKind, SourceType } from "../../../shared/cofactory/discovery.ts";
import { createDiscovery, type Discovery } from "../discovery/discovery.ts";
import { openLocalRegistry, type NicheRegistry } from "../discovery/registry.ts";
import { nicheSimilarity, themeOverlap } from "../discovery/similarity.ts";
import { openDiscoveryStore } from "../discovery/store.ts";
import { openTruth } from "../truth/store.ts";
import { normalizeForMatch } from "../truth/text.ts";
import type { Suite } from "./harness.ts";
import { fixtureFetcher } from "./suites.ts";

function workspace() {
  const dir = mkdtempSync(join(tmpdir(), "cofactory-eval-discovery-"));
  const truth = openTruth(join(dir, "evidence"), { fetch: fixtureFetcher });
  const registry = openLocalRegistry(join(dir, "registry.db"));
  const stores: Array<{ close(): void }> = [];
  const factory = (inputs: Array<{ field: ProfileField; text: string }>): Discovery => {
    const store = openDiscoveryStore(join(dir, `discovery-${stores.length}.db`));
    stores.push(store);
    const discovery = createDiscovery({ store, truth, registry });
    const set = discovery.setProfile({ inputs });
    if (!set.ok) throw new Error(set.reason);
    return discovery;
  };
  return { truth, registry, factory, close: () => { for (const store of stores) store.close(); registry.close(); truth.close(); rmSync(dir, { recursive: true, force: true }); } };
}

const PROFILE: Array<{ field: ProfileField; text: string }> = [
  { field: "domains", text: "independent pharmacy operations" }, { field: "skills", text: "healthcare claims data" }, { field: "geography", text: "Ohio" },
];

type SignalCase = { id: string; url: string; quote: string; kind: SignalKind; sourceType: SourceType; stored: boolean };

const SIGNAL_CASES: SignalCase[] = [
  { id: "forum-real", url: "https://forum-site.test/forum", quote: "Every month I spend two full days matching remits against the PBM statements by hand", kind: "complaint", sourceType: "forum", stored: true },
  { id: "forum-would-pay", url: "https://forum-site.test/forum", quote: "I'd pay for someone to just send me a clean reconciliation report every month", kind: "would_pay", sourceType: "forum", stored: true },
  { id: "job-budget", url: "https://jobs-site.test/jobs", quote: "Budget: $600 per month, fixed price, long term.", kind: "job_post", sourceType: "job_board", stored: true },
  { id: "regulation", url: "https://board-site.test/regulator", quote: "every licensed community pharmacy must retain monthly records reconciling pharmacy benefit manager reimbursements", kind: "regulation", sourceType: "regulator", stored: true },
  { id: "review", url: "https://reviews-site.test/reviews", quote: "If I wanted to hire someone I would not have bought software.", kind: "complaint", sourceType: "review", stored: true },
  { id: "paraphrase", url: "https://forum-site.test/forum", quote: "matching remittances to PBM statements takes us two days every month", kind: "complaint", sourceType: "forum", stored: false },
  { id: "invented-budget", url: "https://jobs-site.test/jobs", quote: "Budget: $2,000 per month, fixed price, long term.", kind: "job_post", sourceType: "job_board", stored: false },
  { id: "script-only", url: "https://forum-site.test/forum", quote: "Our software reconciles every DIR fee automatically for free", kind: "complaint", sourceType: "forum", stored: false },
  { id: "dead-page", url: "https://gone-site.test/missing", quote: "independent pharmacies cannot keep up with the reconciliation work", kind: "complaint", sourceType: "forum", stored: false },
  { id: "too-short", url: "https://forum-site.test/forum", quote: "Same here", kind: "complaint", sourceType: "forum", stored: false },
];

/** Signals: only a quote that is really on its page is stored, and every stored signal points at a verified check. */
export function signalSuite(): Suite {
  return {
    name: "signals",
    async run() {
      const ws = workspace();
      const failures: string[] = [];
      try {
        const discovery = ws.factory(PROFILE);
        let correct = 0, falseStored = 0;
        for (const item of SIGNAL_CASES) {
          const result = await discovery.recordSignal({ url: item.url, quote: item.quote, kind: item.kind, sourceType: item.sourceType, buyerHint: "independent pharmacies", jobHint: "DIR fee reconciliation" });
          if (result.ok === item.stored) correct++;
          else failures.push(`${item.id}: expected ${item.stored ? "stored" : "refused"}, got ${result.ok ? "stored" : `refused (${result.reason})`}`);
          if (result.ok && !item.stored) falseStored++;
        }
        const stored = discovery.store.signals();
        const verified = stored.filter((signal) => ws.truth.claimCheck(signal.claimCheckId)?.verdict === "verified").length;
        const repeat = await discovery.recordSignal({ url: SIGNAL_CASES[0]!.url, quote: SIGNAL_CASES[0]!.quote, kind: "complaint", sourceType: "forum", buyerHint: "x", jobHint: "y" });
        if (!repeat.ok || !repeat.duplicate) failures.push("a repeated quote was stored twice");
        const fraction = stored.length ? verified / stored.length : 0;
        return {
          name: "signals", pass: falseStored === 0 && correct === SIGNAL_CASES.length && fraction === 1 && repeat.ok && repeat.duplicate,
          metrics: { accuracy: correct / SIGNAL_CASES.length, false_stored: falseStored, stored_verified: fraction, stored: stored.length }, failures,
        };
      } finally {
        ws.close();
      }
    },
  };
}

/** Niche rules: independence of the signals, an owner input, a precise gap, and no duplicates here or in another factory. */
export function nicheRuleSuite(): Suite {
  return {
    name: "niche-rules",
    async run() {
      const ws = workspace();
      const failures: string[] = [];
      try {
        const mine = ws.factory(PROFILE);
        const theirs = ws.factory([{ field: "domains", text: "pharmacy software" }, { field: "skills", text: "sales" }, { field: "geography", text: "Texas" }]);
        const record = async (discovery: Discovery, index: number) => {
          const item = SIGNAL_CASES[index]!;
          const result = await discovery.recordSignal({ url: item.url, quote: item.quote, kind: item.kind, sourceType: item.sourceType, buyerHint: "pharmacies", jobHint: "reconciliation" });
          if (!result.ok) throw new Error(result.reason);
          return result.signal.id;
        };
        const [forum, , jobs, regulator, review] = [await record(mine, 0), await record(mine, 1), await record(mine, 2), await record(mine, 3), await record(mine, 4)];
        const sameSite = [await record(mine, 0), await record(mine, 1)];
        const described = async (url: string, quote: string, sourceType: SourceType) => {
          const result = await mine.recordSignal({ url, quote, kind: "price", sourceType, buyerHint: "pharmacies", jobHint: "reconciliation" });
          if (!result.ok) throw new Error(result.reason);
          return result.signal.id;
        };
        const describedOnly = [
          await described("https://vendor-site.test/pricing", "Starts at $49 per store per month, billed annually.", "other"),
          await described("https://agency-site.test/guidance.pdf", "Every licensed facility must keep the training log for three years", "regulator"),
        ];
        const input = mine.profile()!.inputs[0]!.id;
        const gap = "Enterprise tools need an analyst and a 12-month contract; a one-store pharmacy needs the finished monthly report instead.";
        const base = { buyer: "independent pharmacies in Ohio", job: "monthly DIR fee reconciliation report", channel: "state pharmacy association forum", whyGap: gap, boring: true, crossField: false };
        const cases: Array<{ id: string; propose: () => ReturnType<Discovery["proposeNiche"]>; ok: boolean }> = [
          { id: "no-buyer-voice", propose: () => mine.proposeNiche({ ...base, signalIds: [regulator, ...describedOnly], uniqueInputIds: [input] }), ok: false },
          { id: "two-signals", propose: () => mine.proposeNiche({ ...base, signalIds: [forum, jobs], uniqueInputIds: [input] }), ok: false },
          { id: "one-site", propose: () => mine.proposeNiche({ ...base, signalIds: [...sameSite, forum], uniqueInputIds: [input] }), ok: false },
          { id: "no-owner-input", propose: () => mine.proposeNiche({ ...base, signalIds: [forum, jobs, regulator], uniqueInputIds: ["in-made-up"] }), ok: false },
          { id: "vague-gap", propose: () => mine.proposeNiche({ ...base, whyGap: "they don't get it", signalIds: [forum, jobs, regulator], uniqueInputIds: [input] }), ok: false },
          { id: "valid", propose: () => mine.proposeNiche({ ...base, signalIds: [forum, jobs, regulator], uniqueInputIds: [input] }), ok: true },
          { id: "own-duplicate", propose: () => mine.proposeNiche({ ...base, buyer: "independent pharmacy in Ohio", signalIds: [forum, jobs, review], uniqueInputIds: [input] }), ok: false },
          { id: "different-job", propose: () => mine.proposeNiche({ ...base, job: "board audit records binder for PBM reimbursement notices", signalIds: [regulator, review, jobs], uniqueInputIds: [input] }), ok: true },
        ];
        let correct = 0;
        for (const item of cases) {
          const result = item.propose();
          if (result.ok === item.ok) correct++;
          else failures.push(`${item.id}: expected ${item.ok ? "accepted" : "refused"}, got ${result.ok ? "accepted" : `refused (${result.reason})`}`);
        }
        const theirSignals = [await record(theirs, 0), await record(theirs, 2), await record(theirs, 3)];
        const taken = theirs.proposeNiche({ ...base, buyer: "Ohio independent pharmacies", signalIds: theirSignals, uniqueInputIds: [theirs.profile()!.inputs[0]!.id] });
        if (taken.ok) failures.push("another factory took a niche this factory already holds");
        else correct++;
        const total = cases.length + 1;
        return { name: "niche-rules", pass: correct === total, metrics: { accuracy: correct / total }, failures };
      } finally {
        ws.close();
      }
    },
  };
}

const POPULAR = [
  ["dental practices", "appointment reminder and no-show follow-up"], ["real estate agents", "listing description writing"], ["restaurants", "online review responses"],
  ["landscapers", "quote and invoice follow-up"], ["yoga studios", "class schedule social posts"], ["accountants", "client document collection"],
  ["e-commerce stores", "product description writing"], ["therapists", "intake form and insurance paperwork"], ["law firms", "client intake triage"],
  ["gyms", "lapsed member win-back messages"],
] as const;

const PROFILES: Array<{ name: string; inputs: Array<{ field: ProfileField; text: string }>; own: Array<[string, string, string]> }> = [
  { name: "pharmacy", inputs: [{ field: "domains", text: "independent pharmacy operations" }, { field: "skills", text: "claims data" }, { field: "geography", text: "Ohio" }], own: [["independent pharmacies", "DIR fee reconciliation report", "state pharmacy association"], ["compounding pharmacies", "USP 795 beyond-use dating logs", "compounding forums"], ["long-term care pharmacies", "facility medication cart audit prep", "LTC pharmacy groups"], ["veterinary pharmacies", "controlled substance biennial inventory", "vet pharmacy listserv"]] },
  { name: "hvac", inputs: [{ field: "domains", text: "commercial HVAC contracting" }, { field: "network", text: "mechanical contractors association" }, { field: "geography", text: "Midwest" }], own: [["mechanical contractors", "public bid tender digest", "contractor association newsletter"], ["HVAC service firms", "refrigerant leak rate EPA records", "service manager forums"], ["boiler inspectors", "inspection certificate renewal tracking", "state inspector lists"], ["sheet metal shops", "prevailing wage certified payroll", "union shop directories"]] },
  { name: "fisheries", inputs: [{ field: "domains", text: "commercial fishing" }, { field: "geography", text: "Alaska" }, { field: "languages", text: "Spanish" }], own: [["salmon setnetters", "permit renewal and observer coverage paperwork", "fishermen co-op"], ["fish processors", "seafood HACCP log keeping", "processor associations"], ["charter boat captains", "Coast Guard vessel inspection prep", "charter captain groups"], ["seasonal cannery crews", "Spanish safety orientation packets", "cannery hiring boards"]] },
  { name: "funeral", inputs: [{ field: "domains", text: "funeral homes" }, { field: "skills", text: "obituary writing" }, { field: "assets", text: "funeral director contacts" }], own: [["funeral homes", "death certificate filing follow-up", "state funeral directors association"], ["crematories", "cremation authorization chain of custody records", "crematory operator forums"], ["cemeteries", "plot record digitization", "cemetery association"], ["pre-need sellers", "trust compliance reporting", "pre-need regulator lists"]] },
  { name: "aviation", inputs: [{ field: "domains", text: "general aviation maintenance" }, { field: "skills", text: "FAA regulations" }, { field: "network", text: "A&P mechanics" }], own: [["aircraft maintenance shops", "airworthiness directive compliance tracking", "A&P mechanic forums"], ["flight schools", "instructor currency and checkride scheduling", "flight school association"], ["aircraft owners", "logbook digitization for resale", "type club forums"], ["drone operators", "Part 107 waiver applications", "drone pilot groups"]] },
  { name: "farms", inputs: [{ field: "domains", text: "dairy farming" }, { field: "geography", text: "Wisconsin" }, { field: "assets", text: "cooperative membership list" }], own: [["dairy farms", "milk component premium reconciliation", "dairy cooperative"], ["organic growers", "organic certification audit binder", "certifier newsletters"], ["grain elevators", "scale ticket reconciliation", "grain dealer association"], ["farm stands", "SNAP EBT reimbursement paperwork", "farmers market networks"]] },
  { name: "churches", inputs: [{ field: "domains", text: "church administration" }, { field: "network", text: "denominational offices" }, { field: "skills", text: "nonprofit bookkeeping" }], own: [["small churches", "clergy housing allowance documentation", "denominational office"], ["parish schools", "tuition assistance application review", "diocesan school offices"], ["church camps", "camper medical form collection", "camp director networks"], ["mission boards", "missionary support receipting", "mission agency forums"]] },
  { name: "trucking", inputs: [{ field: "domains", text: "owner-operator trucking" }, { field: "skills", text: "IFTA filing" }, { field: "languages", text: "Punjabi" }], own: [["owner-operator truckers", "quarterly IFTA fuel tax filing", "trucker forums"], ["Punjabi-speaking carriers", "DOT audit preparation in Punjabi", "community carrier groups"], ["small fleets", "driver qualification file upkeep", "fleet owner groups"], ["hotshot haulers", "load board rate negotiation logs", "hotshot facebook groups"]] },
  { name: "labs", inputs: [{ field: "domains", text: "clinical laboratory quality" }, { field: "skills", text: "CLIA inspections" }, { field: "assets", text: "lab director contacts" }], own: [["physician office labs", "CLIA proficiency testing record keeping", "lab director listserv"], ["reference labs", "specimen rejection root cause reports", "lab quality forums"], ["blood banks", "donor deferral list reconciliation", "blood bank association"], ["veterinary labs", "AAVLD accreditation document control", "vet lab network"]] },
  { name: "schools", inputs: [{ field: "domains", text: "special education administration" }, { field: "skills", text: "IEP compliance" }, { field: "geography", text: "California" }], own: [["special education departments", "IEP timeline compliance tracking", "SELPA directors"], ["private special ed schools", "nonpublic school certification renewal", "CAPSES members"], ["school psychologists", "assessment report formatting", "school psych forums"], ["charter schools", "Medi-Cal billing documentation for special ed", "charter school association"]] },
];

/**
 * Divergence: ten owners with different profiles, each generator pulled toward the same popular ideas the way models
 * are. Accepted niches must not duplicate across factories, and the factories' portfolios must overlap less than the
 * ceiling, against the same generators with no registry as the baseline.
 */
export function divergenceSuite(ceiling = 0.2): Suite {
  return {
    name: "divergence",
    async run() {
      const failures: string[] = [];
      const runFactories = async (withRegistry: boolean) => {
        const ws = workspace();
        try {
          const accepted: Array<Array<{ buyer: string; job: string; channel: string }>> = [];
          for (const profile of PROFILES) {
            const discovery = ws.factory(profile.inputs);
            const registry: NicheRegistry = withRegistry ? ws.registry : { ...ws.registry, nearest: () => [], claim: () => {} };
            const isolated = createDiscovery({ store: discovery.store, truth: ws.truth, registry });
            const signalIds: string[] = [];
            for (let index = 0; index < 3; index++) signalIds.push(seedSignal(isolated, index));
            const input = isolated.profile()!.inputs[0]!.id;
            const gap = "Incumbents sell general software to large firms; nobody delivers the finished, niche-specific work to the small operators who pay humans for it today.";
            const ideas = [
              ...POPULAR.map(([buyer, job]) => ({ buyer, job, channel: "industry facebook groups" })),
              ...profile.own.map(([buyer, job, channel]) => ({ buyer, job, channel })),
            ];
            const mine: Array<{ buyer: string; job: string; channel: string }> = [];
            for (const idea of ideas) {
              const result = isolated.proposeNiche({ ...idea, whyGap: gap, signalIds, uniqueInputIds: [input], boring: true, crossField: false });
              if (result.ok) mine.push(idea);
            }
            accepted.push(mine);
          }
          return accepted;
        } finally {
          ws.close();
        }
      };
      const governed = await runFactories(true);
      const baseline = await runFactories(false);
      const pairs = (sets: typeof governed) => {
        let overlap = 0, duplicates = 0, count = 0;
        for (let a = 0; a < sets.length; a++) for (let b = a + 1; b < sets.length; b++) {
          count++;
          overlap += themeOverlap(sets[a]!, sets[b]!);
          for (const x of sets[a]!) for (const y of sets[b]!) if (nicheSimilarity(x, y) >= 0.6) duplicates++;
        }
        return { overlap: overlap / count, duplicates };
      };
      const governedPairs = pairs(governed), baselinePairs = pairs(baseline);
      const smallest = Math.min(...governed.map((set) => set.length));
      if (governedPairs.duplicates) failures.push(`${governedPairs.duplicates} near-duplicate niches across factories`);
      if (governedPairs.overlap > ceiling) failures.push(`theme overlap ${governedPairs.overlap.toFixed(3)} above the ceiling ${ceiling}`);
      if (smallest < 4) failures.push(`a factory kept only ${smallest} niches`);
      return {
        name: "divergence", pass: governedPairs.duplicates === 0 && governedPairs.overlap <= ceiling && smallest >= 4,
        metrics: { theme_overlap_errors: Number(governedPairs.overlap.toFixed(4)), cross_factory_duplicate_errors: governedPairs.duplicates, baseline_overlap: Number(baselinePairs.overlap.toFixed(4)), smallest_portfolio: smallest },
        failures,
      };
    },
  };
}

/** A verified signal written straight to the store: the signal suite proves verification; this suite tests divergence. */
function seedSignal(discovery: Discovery, index: number): string {
  const site = ["forum-site.test", "jobs-site.test", "board-site.test"][index]!;
  const signal: Signal = {
    id: randomUUID(), factoryId: discovery.profile()!.factoryId, batchId: null, at: Date.now(), url: `https://${site}/page`, site, quote: `fixture signal ${index} for the divergence eval`,
    kind: "complaint", sourceType: index === 1 ? "job_board" : "forum", buyerHint: "", jobHint: "", claimCheckId: 0, snapshotId: null,
  };
  discovery.store.addSignal(signal, normalizeForMatch(signal.quote));
  return signal.id;
}

export const DISCOVERY_SUITES: readonly Suite[] = [signalSuite(), nicheRuleSuite(), divergenceSuite()];
