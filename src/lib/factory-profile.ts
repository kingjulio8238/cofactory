// The factory profile the first run builds: what the owner knows, written by the AI that knows them best, read back here
// into the fields the scout searches from (POST /api/cofactory/profile).

export type ProfileGroup = "domains" | "skills" | "network" | "assets" | "geography" | "languages" | "interests";

export interface ProfileDraft {
  groups: Record<ProfileGroup, string[]>;
  /** Kinds of business the owner will not run. */
  constraints: string[];
  /** The owner's own hunches, looked into first. */
  seedNiches: string[];
}

export const GROUP_ORDER: readonly ProfileGroup[] = ["domains", "skills", "network", "assets", "geography", "languages", "interests"];

export const GROUP_LABELS: Record<ProfileGroup, { title: string; hint: string }> = {
  domains: { title: "Fields and trades you know", hint: "Pharmacy billing, commercial roofing" },
  skills: { title: "What you're good at", hint: "Reconciliations, cold calling" },
  network: { title: "People you can reach", hint: "Independent pharmacists in Ohio" },
  assets: { title: "What you already have", hint: "A list of 300 contractors" },
  geography: { title: "Places you know", hint: "Columbus, rural Ohio" },
  languages: { title: "Languages", hint: "English, Spanish" },
  interests: { title: "What you'd enjoy working on", hint: "Old buildings, logistics" },
};

export const emptyDraft = (): ProfileDraft => ({
  groups: { domains: [], skills: [], network: [], assets: [], geography: [], languages: [], interests: [] },
  constraints: [],
  seedNiches: [],
});

/** The prompt the owner pastes into the AI that knows them; its answer comes back as the block `readProfile` reads. */
export const PROFILE_PROMPT = `I'm setting up Cofactory, which finds small, very specific businesses that only someone with my background would think to start. Using everything you know about me from our past conversations, write my profile so it can search from what is unusual about me, not from what everyone knows.

Answer with only this block, filled in. Separate items with semicolons. Be specific (name the trade, the place, the kind of people), leave a line empty rather than guess, and never include anyone's private details.

COFACTORY PROFILE
Fields and trades I know:
Skills:
People I can reach:
What I already have:
Places I know:
Languages:
Interests:
Hard no's:
Hunches:
END PROFILE`;

const LINES: Array<{ match: RegExp; to: ProfileGroup | "constraints" | "seedNiches" }> = [
  { match: /^fields?( and trades)?( i know)?$/i, to: "domains" },
  { match: /^skills?$/i, to: "skills" },
  { match: /^people( i can reach)?$/i, to: "network" },
  { match: /^what i (already )?have$/i, to: "assets" },
  { match: /^places( i know)?$/i, to: "geography" },
  { match: /^languages?$/i, to: "languages" },
  { match: /^interests?$/i, to: "interests" },
  { match: /^hard no'?s?$/i, to: "constraints" },
  { match: /^hunch(es)?$/i, to: "seedNiches" },
];

const MAX_ITEM = 300;

/** Reads a pasted answer into a draft, or null when no profile block is in it. Unknown lines and empty items are dropped. */
export function readProfile(text: string): ProfileDraft | null {
  const start = text.search(/COFACTORY PROFILE/i);
  if (start < 0) return null;
  const end = text.slice(start).search(/END PROFILE/i);
  const block = end < 0 ? text.slice(start) : text.slice(start, start + end);
  const draft = emptyDraft();
  let found = 0;
  for (const raw of block.split("\n").slice(1)) {
    const line = raw.replace(/^[\s*>•-]+/, "").replace(/\*\*/g, "");
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const label = line.slice(0, colon).trim();
    const target = LINES.find((entry) => entry.match.test(label))?.to;
    if (!target) continue;
    const items = line.slice(colon + 1).split(";").map((item) => item.trim().replace(/\.$/, "")).filter((item) => item && !/^(none|n\/a|-)$/i.test(item)).map((item) => item.slice(0, MAX_ITEM));
    if (!items.length) continue;
    found += items.length;
    if (target === "constraints" || target === "seedNiches") draft[target].push(...items);
    else draft.groups[target].push(...items);
  }
  return found ? draft : null;
}

/** How many things the draft holds that the scout can search from (hard no's and hunches aside). */
export const inputCount = (draft: ProfileDraft): number => GROUP_ORDER.reduce((sum, group) => sum + draft.groups[group].length, 0);

/** The body of POST /api/cofactory/profile. */
export function profileBody(draft: ProfileDraft) {
  return {
    inputs: GROUP_ORDER.flatMap((field) => draft.groups[field].map((text) => ({ field, text }))),
    constraints: draft.constraints,
    seedNiches: draft.seedNiches.slice(0, 3),
  };
}

/** A saved profile from GET /api/cofactory/settings, back into a draft for editing. */
export function draftFromProfile(profile: { inputs: Array<{ field: string; text: string }>; constraints: string[]; seedNiches: string[] } | null): ProfileDraft {
  const draft = emptyDraft();
  if (!profile) return draft;
  for (const input of profile.inputs) if ((GROUP_ORDER as readonly string[]).includes(input.field)) draft.groups[input.field as ProfileGroup].push(input.text);
  draft.constraints = [...profile.constraints];
  draft.seedNiches = [...profile.seedNiches];
  return draft;
}
