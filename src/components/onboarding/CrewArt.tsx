// The factory's crew as step art: each role in its signature look (the same colour and body the launcher gives its bot),
// standing on one line, in the mood the step calls for.
import { useReducedMotion } from "motion/react";
import type { CharacterState } from "@/lib/character";
import { characterBase, SHELL_FOR_COLOR } from "@/lib/character-identity";
import { Character } from "../Character";

export type CrewRole = "lead" | "scout" | "ceo" | "builder" | "marketer" | "seller" | "operator";

const LOOKS: Record<CrewRole, { color: keyof typeof SHELL_FOR_COLOR; body: string; name: string }> = {
  lead: { color: "blue", body: "drip", name: "Factory lead" },
  scout: { color: "red", body: "sprout", name: "Factory scout" },
  ceo: { color: "purple", body: "bruin", name: "CEO" },
  builder: { color: "green", body: "boxo", name: "Builder" },
  marketer: { color: "pink", body: "boo", name: "Marketer" },
  seller: { color: "yellow", body: "hop", name: "Seller" },
  operator: { color: "silver", body: "hoot", name: "Stand-in" },
};

export function CrewArt({ crew, size = 64 }: { crew: Array<{ role: CrewRole; state?: CharacterState }>; size?: number }) {
  const reduced = useReducedMotion() === true;
  return (
    <span className="relative flex items-end justify-center gap-3" aria-hidden="true">
      {crew.map(({ role, state }) => (
        <Character key={role} base={characterBase(LOOKS[role].body)} shell={SHELL_FOR_COLOR[LOOKS[role].color]} state={state ?? "idle"} size={size} animated={!reduced} />
      ))}
    </span>
  );
}
