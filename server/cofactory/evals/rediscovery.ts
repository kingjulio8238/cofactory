import { jaccard, tokens } from "../discovery/similarity.ts";

/** A real niche business that appeared after the model's knowledge cutoff, with the evidence it exists and earns. */
export interface RediscoveryTarget {
  name: string;
  url: string;
  buyer: string;
  job: string;
  channel: string;
  domain: string;
  launch_date: string;
  launch_evidence: { url: string; quote: string };
  revenue_evidence: { url: string; quote: string };
  price: string;
}

/**
 * Whether a factory's candidate is the target's niche in other words. Phrasings differ, so this is deliberately looser
 * than the registry's duplicate test: the buyers must share a meaningful word and the jobs must overlap.
 */
export function matchesTarget(target: Pick<RediscoveryTarget, "buyer" | "job">, candidate: { buyer: string; job: string }): number {
  const buyer = jaccard(tokens(target.buyer), tokens(candidate.buyer));
  const job = jaccard(tokens(target.job), tokens(candidate.job));
  return buyer >= 0.2 && job >= 0.15 ? Math.round((0.5 * buyer + 0.5 * job) * 1000) / 1000 : 0;
}

/** Recall: the share of targets a factory found among its candidates, given one factory run per target's domain. */
export function rediscoveryRecall(runs: Array<{ target: RediscoveryTarget; candidates: Array<{ buyer: string; job: string }> }>) {
  const rows = runs.map(({ target, candidates }) => {
    const best = candidates.map((candidate) => ({ candidate, match: matchesTarget(target, candidate) })).sort((a, b) => b.match - a.match)[0];
    return { target: target.name, found: Boolean(best && best.match > 0), match: best?.match ?? 0, closest: best ? `${best.candidate.buyer} · ${best.candidate.job}` : null };
  });
  return { recall: rows.length ? rows.filter((row) => row.found).length / rows.length : 0, rows };
}

/** The owner profile a rediscovery run starts from: only the target's domain, so the factory has to find the niche itself. */
export function profileFor(target: RediscoveryTarget) {
  return {
    inputs: [
      { field: "domains" as const, text: target.domain },
      { field: "interests" as const, text: `what people in ${target.domain} pay to have solved` },
      { field: "languages" as const, text: "English" },
    ],
    constraints: [],
    seedNiches: [],
  };
}
