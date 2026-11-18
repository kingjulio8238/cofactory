import { createHash } from "node:crypto";

// US Census Bureau, 2022 NAICS 6-digit industries (public domain), public administration (92) left out.
import industries from "../../../shared/cofactory/naics-2022.json" with { type: "json" };

export interface Territory {
  code: string;
  title: string;
}

/** Census catch-alls ("All Other Legal Services", "Miscellaneous Intermediation") name no industry anyone works in. */
const CATCH_ALL = /(^|\s)(All )?Other\s|Miscellaneous/;

/** Every industry a factory can be sent into. */
export const INDUSTRIES: readonly Territory[] = (industries as Array<[string, string]>).filter(([, title]) => !CATCH_ALL.test(title)).map(([code, title]) => ({ code, title }));

/** A small deterministic generator, so a factory's draw can be reproduced from its seed. */
function stream(seed: string): () => number {
  let state = createHash("sha256").update(seed).digest().readUInt32LE(0) || 1;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

/**
 * Where a factory starts looking when its owner gave it nowhere to start: `count` industries drawn without replacement,
 * seeded by the factory, from different sectors where it can, and never one already in `avoid` (another factory's
 * territories, or ones this factory has already searched). Two factories share a territory only by rare chance, which is
 * what keeps them off each other's niches without asking their owners anything.
 */
export function drawTerritories(seed: string, count: number, avoid: ReadonlySet<string> = new Set()): Territory[] {
  const next = stream(seed);
  const pool = INDUSTRIES.filter((industry) => !avoid.has(industry.code));
  const drawn: Territory[] = [];
  const sectors = new Set<string>();
  for (let tries = 0; drawn.length < count && pool.length && tries < 10_000; tries++) {
    const index = Math.floor(next() * pool.length);
    const pick = pool[index]!;
    const sector = pick.code.slice(0, 2);
    if (sectors.has(sector) && tries < 2_000) continue;
    pool.splice(index, 1);
    sectors.add(sector);
    drawn.push(pick);
  }
  return drawn;
}

export const territoryText = (territory: Territory): string => `${territory.title} (NAICS ${territory.code})`;
export const territoryCode = (text: string): string | null => /\(NAICS (\d{6})\)/.exec(text)?.[1] ?? null;
