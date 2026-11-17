const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "for", "to", "in", "on", "at", "by", "with", "from", "who", "that", "their", "its", "is", "are",
  "be", "as", "into", "per", "via", "small", "independent", "local", "owners", "owner", "business", "businesses", "company", "companies",
  "people", "teams", "team", "service", "services", "monthly", "weekly",
]);

const stem = (word: string) => word.replace(/(ies)$/, "y").replace(/(ing|ers|er|ed|es|s)$/, "");

/** The content words of a phrase, lowercased and roughly stemmed, so "HVAC contractors" and "hvac contractor" match. */
export function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().normalize("NFKC").replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word)).map(stem).filter((word) => word.length > 1));
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (!a.size && !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  return shared / (a.size + b.size - shared);
}

export interface NicheKey { buyer: string; job: string; channel: string }

/** How alike two niches are, 0..1: the buyer and the job decide most of it, the channel a little. */
export function nicheSimilarity(a: NicheKey, b: NicheKey): number {
  return 0.45 * jaccard(tokens(a.buyer), tokens(b.buyer)) + 0.45 * jaccard(tokens(a.job), tokens(b.job)) + 0.1 * jaccard(tokens(a.channel), tokens(b.channel));
}

/** Cosine of two niche sets' token counts: how much two factories' portfolios talk about the same things. */
export function themeOverlap(a: readonly NicheKey[], b: readonly NicheKey[]): number {
  const bag = (niches: readonly NicheKey[]) => {
    const counts = new Map<string, number>();
    for (const niche of niches) for (const token of tokens(`${niche.buyer} ${niche.job}`)) counts.set(token, (counts.get(token) ?? 0) + 1);
    return counts;
  };
  const x = bag(a), y = bag(b);
  let dot = 0, nx = 0, ny = 0;
  for (const [token, count] of x) { dot += count * (y.get(token) ?? 0); nx += count * count; }
  for (const count of y.values()) ny += count * count;
  return nx && ny ? dot / Math.sqrt(nx * ny) : 0;
}
