import { DISCOVERY_SUITES } from "./discovery-suites.ts";
import { DOSSIER_SUITES } from "./dossier-suites.ts";
import type { Suite } from "./harness.ts";
import { FOUNDATION_SUITES } from "./suites.ts";

/** Every Cofactory eval suite, in the order `pnpm cofactory:eval` runs them. */
export const ALL_SUITES: readonly Suite[] = [...FOUNDATION_SUITES, ...DISCOVERY_SUITES, ...DOSSIER_SUITES];
