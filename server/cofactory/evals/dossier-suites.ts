import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_DOSSIER_POLICY, type DossierBody } from "../../../shared/cofactory/dossier.ts";
import { createDiscovery } from "../discovery/discovery.ts";
import { openLocalRegistry } from "../discovery/registry.ts";
import { openDiscoveryStore } from "../discovery/store.ts";
import { createDossiers } from "../dossier/dossiers.ts";
import { interrogate } from "../dossier/qa.ts";
import { scoreDossier } from "../dossier/score.ts";
import { verifyDossier } from "../dossier/verify.ts";
import { openTruth } from "../truth/store.ts";
import type { Suite } from "./harness.ts";
import { fixtureFetcher } from "./suites.ts";

/** A dossier every claim of which is true on the fixture pages. */
export function goodDossier(): DossierBody {
  return {
    buyers: [1, 2, 3, 4, 5, 6].map((n) => ({ name: `Riverside Pharmacy ${n}`, url: `https://buyers-site.test/buyer-${n}`, contactUrl: `https://buyers-site.test/contact-${n}`, whyFit: "independent, Ohio, reconciles by hand" })),
    pains: [
      ...[1, 2, 3].map((n) => ({ url: `https://forum-site.test/thread-${n}`, quote: `reconciling the remits by hand eats a whole weekend every month for store number ${n}`, sourceType: "forum" as const })),
      ...[4, 5].map((n) => ({ url: `https://qa-site.test/thread-${n}`, quote: `reconciling the remits by hand eats a whole weekend every month for store number ${n}`, sourceType: "qa" as const })),
    ],
    spend: [{ url: "https://vendor-site.test/pricing", quote: "Starts at $49 per store per month, billed annually.", amountCents: 4_900, per: "month" }],
    buyerCount: { url: "https://board-site.test/registry", quote: "There are 1,240 licensed independent community pharmacies in Ohio", value: 1_240 },
    incumbents: [{ name: "RemitCheck Enterprise", url: "https://vendor-site.test/pricing", whatTheyMiss: "sells software to chains of 25+ stores; one-store owners still do the work", priceCents: 4_900 }],
    gap: {
      why: "Vendors sell seats of reconciliation software and need an analyst on the buyer's side; a one-store owner needs the finished report, which is labor vendors do not want.",
      hiddenReasonsRuledOut: "No exclusive PBM data licence is needed; the remits are the pharmacy's own files, and no state rule reserves the work.",
    },
    firstTen: { channel: "state pharmacy association forum", steps: "Post a free sample reconciliation in the association forum, then email the ten owners who reply with a fixed monthly price and a payment link." },
    failureModes: ["Owners will not share remittance files with an outside service", "PSAOs bundle a free version of the report", "Clawbacks are too small at one store to justify the fee"],
    risks: { licensedAdvice: false, regulatedClaims: false, platformTos: null, gatekeeperShare: 0.2, procurement: false, notes: "Handles PHI-adjacent remittance data: needs a BAA and HIPAA-grade storage." },
    offer: {
      archetype: "done_for_you", priceCents: 15_000, per: "month",
      humanAlternative: { url: "https://jobs-site.test/jobs", quote: "Budget: $600 per month, fixed price, long term.", amountCents: 60_000, per: "month" },
      costToServeCents: 2_000,
    },
  };
}

type Variant = { id: string; edit: (body: DossierBody) => void; pass: boolean };

const VARIANTS: Variant[] = [
  { id: "good", edit: () => {}, pass: true },
  { id: "invented-pain", edit: (body) => { body.pains[0]!.quote = "we lose forty thousand dollars a year to clawbacks we never see"; body.pains[1]!.quote = "nobody in Ohio offers this as a monthly service"; }, pass: false },
  { id: "inflated-count", edit: (body) => { body.buyerCount.value = 12_400; }, pass: false },
  { id: "wrong-human-price", edit: (body) => { body.offer.humanAlternative.amountCents = 200_000; }, pass: false },
  { id: "dead-buyers", edit: (body) => { body.buyers.forEach((buyer, index) => { if (index < 3) buyer.url = `https://gone-site.test/missing-${index}`; }); }, pass: false },
  { id: "one-site-voices", edit: (body) => { body.pains.forEach((pain, index) => { pain.url = `https://forum-site.test/thread-${index + 1}`; pain.quote = `reconciling the remits by hand eats a whole weekend every month for store number ${index + 1}`; }); }, pass: false },
  { id: "news-not-voices", edit: (body) => { body.pains.forEach((pain) => { pain.sourceType = "news"; }); }, pass: false },
  { id: "vague-plan", edit: (body) => { body.firstTen.steps = "marketing"; body.failureModes = ["competition"]; }, pass: false },
  { id: "job-ads-as-pain", edit: (body) => { body.pains.forEach((pain) => { pain.sourceType = "job_board"; }); }, pass: false },
  { id: "wrong-spend-amount", edit: (body) => { body.spend[0]!.amountCents = 9_900; }, pass: false },
  { id: "undeclared-tax-work", edit: (body) => { body.gap.why = `${body.gap.why} We also prepare and file each store's 1099s.`; }, pass: false },
  { id: "tax-work-scoped-in-notes", edit: (body) => { body.gap.why = `${body.gap.why} We also prepare and file each store's 1099s.`; body.risks.notes = `${body.risks.notes} 1099s are produced from amounts the owner approves; classification questions go to their accountant.`; }, pass: true },
];

/** The dossier verifier on a hand-labelled good dossier and labelled variants of it. A bad dossier that passes is the one error never allowed. */
export function dossierVerifierSuite(): Suite {
  return {
    name: "dossier-verifier",
    async run() {
      const dir = mkdtempSync(join(tmpdir(), "cofactory-eval-dossier-"));
      const truth = openTruth(dir, { fetch: fixtureFetcher });
      const failures: string[] = [];
      try {
        let correct = 0, falsePass = 0, goodShare = 0;
        for (const variant of VARIANTS) {
          const body = goodDossier();
          variant.edit(body);
          const report = await verifyDossier(truth, body, DEFAULT_DOSSIER_POLICY, `eval:${variant.id}`);
          if (report.pass === variant.pass) correct++;
          else failures.push(`${variant.id}: expected ${variant.pass ? "pass" : "fail"}, got ${report.pass ? "pass" : `fail (${[...report.criticalFailures, ...report.structural].join("; ") || `${Math.round(report.verifiedShare * 100)}% verified`})`}`);
          if (report.pass && !variant.pass) falsePass++;
          if (variant.id === "good") goodShare = report.verifiedShare;
        }
        return {
          name: "dossier-verifier", pass: correct === VARIANTS.length && falsePass === 0 && goodShare >= DEFAULT_DOSSIER_POLICY.verifiedShare,
          metrics: { accuracy: correct / VARIANTS.length, false_pass: falsePass, good_verified_share: goodShare }, failures,
        };
      } finally {
        truth.close();
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

/** Adversarial questions: a full dossier answers them; a thin one, or one whose evidence failed, does not, however it reads. */
export function adversarialQaSuite(): Suite {
  return {
    name: "adversarial-qa",
    async run() {
      const dir = mkdtempSync(join(tmpdir(), "cofactory-eval-qa-"));
      const truth = openTruth(dir, { fetch: fixtureFetcher });
      const failures: string[] = [];
      try {
        const good = goodDossier();
        const goodReport = await verifyDossier(truth, good, DEFAULT_DOSSIER_POLICY, "eval:qa-good");
        const thin = goodDossier();
        thin.incumbents = [];
        thin.gap = { why: "big gap", hiddenReasonsRuledOut: "" };
        thin.firstTen.steps = "ads";
        thin.failureModes = [];
        thin.risks.notes = "";
        thin.offer.costToServeCents = 0;
        thin.offer.humanAlternative.url = "https://gone-site.test/rates";
        thin.buyerCount.url = "https://gone-site.test/count";
        const thinReport = await verifyDossier(truth, thin, DEFAULT_DOSSIER_POLICY, "eval:qa-thin");
        let goodPasses = 0, thinFails = 0, stable = 0;
        const keys = Array.from({ length: 20 }, (_, index) => `niche-${index}:1`);
        for (const key of keys) {
          const a = interrogate(key, good, goodReport, DEFAULT_DOSSIER_POLICY);
          if (a.pass) goodPasses++;
          else failures.push(`good dossier failed questions for ${key}: ${a.questions.filter((item) => !item.answer).map((item) => item.id).join(", ")}`);
          if (!interrogate(key, thin, thinReport, DEFAULT_DOSSIER_POLICY).pass) thinFails++;
          if (JSON.stringify(interrogate(key, good, goodReport, DEFAULT_DOSSIER_POLICY)) === JSON.stringify(a)) stable++;
        }
        if (thinFails < keys.length) failures.push(`a thin dossier passed the questions for ${keys.length - thinFails} of ${keys.length} draws`);
        return {
          name: "adversarial-qa", pass: goodPasses === keys.length && thinFails === keys.length && stable === keys.length,
          metrics: { good_pass_rate: goodPasses / keys.length, thin_fail_rate: thinFails / keys.length, deterministic: stable / keys.length }, failures,
        };
      } finally {
        truth.close();
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

/** Scoring: every veto fires on its case, a clean strong dossier outranks a clean weak one, and the champion rule holds. */
export function scoringSuite(): Suite {
  return {
    name: "scoring",
    async run() {
      const dir = mkdtempSync(join(tmpdir(), "cofactory-eval-score-"));
      const truth = openTruth(join(dir, "evidence"), { fetch: fixtureFetcher });
      const registry = openLocalRegistry(join(dir, "registry.db"));
      const store = openDiscoveryStore(join(dir, "discovery.db"));
      const failures: string[] = [];
      try {
        const verification = await verifyDossier(truth, goodDossier(), DEFAULT_DOSSIER_POLICY, "eval:score");
        const qa = interrogate("eval:1", goodDossier(), verification, DEFAULT_DOSSIER_POLICY);
        const niche = { boring: true, uniqueInputIds: ["in-1"], density: 0 };
        const score = (edit: (body: DossierBody) => void, takenBy: string | null = null) => {
          const body = goodDossier();
          edit(body);
          return scoreDossier({ niche, body, verification, qa, policy: DEFAULT_DOSSIER_POLICY, takenBy });
        };
        const vetoCases: Array<[string, ReturnType<typeof score>]> = [
          ["licensed_advice", score((body) => { body.risks.licensedAdvice = true; })],
          ["regulated_claims", score((body) => { body.risks.regulatedClaims = true; })],
          ["platform_tos", score((body) => { body.risks.platformTos = { platform: "Amazon Seller Central", rule: "no off-platform contact with buyers" }; })],
          ["gatekeeper", score((body) => { body.risks.gatekeeperShare = 0.8; })],
          ["procurement", score((body) => { body.risks.procurement = true; })],
          ["procurement", score((body) => { body.offer.priceCents = 900_00 * 10; })],
          ["price_ratio", score((body) => { body.offer.priceCents = 30_000; })],
          ["unit_economics", score((body) => { body.offer.costToServeCents = 10_000; })],
          ["taken", score(() => {}, "other-factory")],
        ];
        let vetoesRight = 0;
        for (const [expected, report] of vetoCases) {
          if (report.vetoes.some((item) => item.veto === expected)) vetoesRight++;
          else failures.push(`expected veto ${expected}, got ${report.vetoes.map((item) => item.veto).join(", ") || "none"}`);
        }
        const strong = score(() => {});
        const weak = score((body) => { body.offer.priceCents = 19_000; body.incumbents = []; });
        if (strong.vetoes.length) failures.push(`the strong dossier was vetoed: ${strong.vetoes.map((item) => item.why).join("; ")}`);
        const ordered = strong.score > weak.score && !weak.vetoes.length;
        if (!ordered) failures.push(`strong ${strong.score} should outrank weak ${weak.score}`);

        const discovery = createDiscovery({ store, truth, registry });
        discovery.setProfile({ inputs: [{ field: "domains", text: "pharmacy" }, { field: "skills", text: "claims" }, { field: "geography", text: "Ohio" }] });
        const dossiers = createDossiers({ store, truth, registry, policy: { shortlistSize: 1 } });
        const signal = await discovery.recordSignal({ url: "https://forum-site.test/thread-9", quote: "reconciling the remits by hand eats a whole weekend every month for store number 9", kind: "complaint", sourceType: "forum", buyerHint: "x", jobHint: "y" });
        const makeNiche = (job: string) => {
          const id = `niche-${job}`;
          store.addNiche({ id, factoryId: discovery.profile()!.factoryId, batchId: "b", at: 0, buyer: "independent pharmacies", job, channel: "forum", whyGap: "x".repeat(50), signalIds: [], uniqueInputIds: ["in-1"], boring: true, crossField: false, status: "selected", density: 0 });
          return id;
        };
        const first = await dossiers.submit(makeNiche("monthly reconciliation"), goodDossier());
        const secondBody = goodDossier();
        secondBody.offer.priceCents = 19_000;
        const second = await dossiers.submit(makeNiche("clawback appeals"), secondBody);
        const vetoedBody = goodDossier();
        vetoedBody.risks.licensedAdvice = true;
        const vetoed = await dossiers.submit(makeNiche("pharmacist consults"), vetoedBody);
        if (!first.ok || !second.ok || !vetoed.ok) throw new Error("dossier submission failed");
        const shortlistRight = store.dossier(first.dossier.id)!.status === "shortlisted" && store.dossier(second.dossier.id)!.status === "scored" && vetoed.dossier.status === "dropped";
        if (!shortlistRight) failures.push(`shortlist: first ${store.dossier(first.dossier.id)!.status}, second ${store.dossier(second.dossier.id)!.status}, vetoed ${vetoed.dossier.status}`);
        const why = "The score undervalues it: the clawback appeals job recurs weekly and the forum threads show owners asking for exactly this.";
        const noEvidence = dossiers.champion(second.dossier.id, "lead", why, ["made-up"]);
        const vetoedChampion = dossiers.champion(vetoed.dossier.id, "lead", why, [signal.ok ? signal.signal.id : ""]);
        const championed = dossiers.champion(second.dossier.id, "lead", why, [signal.ok ? signal.signal.id : ""]);
        const championRight = !noEvidence.ok && !vetoedChampion.ok && championed.ok && store.niche("niche-clawback appeals")!.status === "shortlisted";
        if (!championRight) failures.push(`champion rule: no-evidence ${noEvidence.ok}, vetoed ${vetoedChampion.ok}, valid ${championed.ok}`);
        return {
          name: "scoring", pass: vetoesRight === vetoCases.length && ordered && shortlistRight && championRight && !strong.vetoes.length,
          metrics: { veto_accuracy: vetoesRight / vetoCases.length, strong_score: strong.score, weak_score: weak.score }, failures,
        };
      } finally {
        store.close(); registry.close(); truth.close();
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

export const DOSSIER_SUITES: readonly Suite[] = [dossierVerifierSuite(), adversarialQaSuite(), scoringSuite()];
