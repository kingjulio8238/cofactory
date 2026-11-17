import { describe, expect, it } from "vitest";

import { PROFILE_PROMPT, draftFromProfile, inputCount, profileBody, readProfile } from "./factory-profile";

describe("factory profile import", () => {
  it("reads the block an AI writes back, in markdown or plain", () => {
    const answer = `Sure! Here's your profile:\n\n**COFACTORY PROFILE**\n- **Fields and trades I know:** pharmacy billing; DIR fee audits; long-term care pharmacies\n- Skills: reconciliations; writing appeals.\n- People I can reach: independent pharmacists in Ohio\n- What I already have:\n- Places I know: Columbus; rural Ohio\n- Languages: English; Spanish\n- Interests: none\n- Hard no's: anything medical advice\n- Hunches: DIR fee recovery for 1-3 store owners; LTC pharmacy audits; a third; a fourth\nEND PROFILE\nLet me know if you want changes.`;
    const draft = readProfile(answer)!;
    expect(draft.groups.domains).toEqual(["pharmacy billing", "DIR fee audits", "long-term care pharmacies"]);
    expect(draft.groups.skills).toEqual(["reconciliations", "writing appeals"]);
    expect(draft.groups.network).toEqual(["independent pharmacists in Ohio"]);
    expect(draft.groups.assets).toEqual([]);
    expect(draft.groups.interests).toEqual([]);
    expect(draft.constraints).toEqual(["anything medical advice"]);
    expect(inputCount(draft)).toBe(10);
    expect(profileBody(draft).seedNiches).toHaveLength(3);
    expect(profileBody(draft).inputs[0]).toEqual({ field: "domains", text: "pharmacy billing" });
  });

  it("finds nothing in an answer without the block, or with an empty one", () => {
    expect(readProfile("I don't know much about you yet.")).toBeNull();
    expect(readProfile(PROFILE_PROMPT)).toBeNull();
  });

  it("round-trips a saved profile for editing", () => {
    const draft = draftFromProfile({ inputs: [{ field: "skills", text: "cold calling" }, { field: "geography", text: "Ohio" }], constraints: ["no crypto"], seedNiches: [] });
    expect(draft.groups.skills).toEqual(["cold calling"]);
    expect(profileBody(draft).inputs).toEqual([{ field: "skills", text: "cold calling" }, { field: "geography", text: "Ohio" }]);
  });
});
