// `pnpm cofactory:walkthrough`: a throwaway Cofactory to click through by hand, from the welcome screen to a launched
// company. Its bots run on the fake engine (no model use, no money, nothing leaves the Mac) and are scripted to move the
// factory along as you go; your real app and data are never touched. Ctrl+C stops it and deletes its data.
//
//   --no-open    do not open the browser
//
// COFACTORY_WALKTHROUGH_PORT (8971; webhooks on +1) and COFACTORY_WALKTHROUGH_UI_PORT (5398) change the ports.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { askToLaunch, scriptFirstSearch, searchToShortlist, startScriptedFactory } from "../server/cofactory/testing/scripted-factory.ts";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.COFACTORY_WALKTHROUGH_PORT || 8971);
const UI_PORT = Number(process.env.COFACTORY_WALKTHROUGH_UI_PORT || 5398);
if ([8799, 8800, 5199].includes(PORT) || [8799, 5199].includes(UI_PORT)) throw new Error("those ports belong to your real app");

const dataDir = mkdtempSync(join(tmpdir(), "cofactory-walkthrough-"));
const factory = await startScriptedFactory(dataDir, PORT);
const ui = spawn(join(REPO, "node_modules", ".bin", "vite"), ["--strictPort"], { cwd: REPO, env: { ...process.env, DUSK_PORT: String(PORT), DUSK_UI_PORT: String(UI_PORT) }, stdio: "ignore", detached: true });
const stop = () => {
  factory.stop();
  if (ui.pid) { try { process.kill(-ui.pid, "SIGKILL"); } catch { ui.kill("SIGKILL"); } }
  rmSync(dataDir, { recursive: true, force: true });
};
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { stop(); console.log("\nStopped, and its data is deleted."); process.exit(0); });
process.on("uncaughtException", (error) => { stop(); console.error(error); process.exit(1); });

const url = `http://127.0.0.1:${UI_PORT}`;
const step = (n: number, text: string) => console.log(`\n${n}. ${text}`);
await factory.until("the UI", async () => (await fetch(url)).ok, 60_000);
console.log(`Cofactory walkthrough at ${url} (fake bots, throwaway data). Ctrl+C to stop.`);
if (!process.argv.includes("--no-open") && process.platform === "darwin") execFileSync("open", [url]);

scriptFirstSearch(factory);
step(1, "Welcome screen: the crew and \"Meet Cofactory\". Click Get started.");
step(2, "Go through the four steps: where you're based (pick a country), Fund your factory, Anything in mind, What needs your OK.");
step(3, "\"Your factory is open\" lists six industries. Click Meet your scout.");
const HOUR = 60 * 60_000;
await factory.until("the factory to open", async () => (await factory.call("GET", "/api/cofactory/settings")).settings?.onboardedAt, HOUR);
step(4, "The scout's chat opens with its replies (the fake engine answers \"hello from fake claude\"). The scout is now finding niches...");
const { dossierId } = await searchToShortlist(factory);
await askToLaunch(factory, dossierId);
step(5, "Click the scout's name at the top to open its panel. Under Factory → Needs you: \"Start Riverside Recon?\". Click Decline first.");
const launched = async () => ((await factory.call("GET", "/api/cofactory/state")).companies as unknown[]).length > 0;
const decided = async () => ((await factory.call("GET", "/api/cofactory/approvals")).approvals as unknown[]).length === 0;
await factory.until("your decision", decided, HOUR);
if (!(await launched())) {
  step(6, "Declined, and nothing launched. The lead asks again: Approve it this time (it shows up within a few seconds).");
  await askToLaunch(factory, dossierId);
  await factory.until("your approval", decided, HOUR);
}
if (!(await launched())) { console.log("\nDeclined again. Ctrl+C and run it again to try Approve."); await new Promise(() => {}); }
step(7, "Riverside Recon appears on the left rail, a character in the company's own colour, within about 10 seconds.");
step(8, "Click it: the sidebar shows only its crew and the CEO's chat opens. Click the top rail icon to go back to the factory, then back again.");
step(9, "Open the CEO's panel → Factory: Needs you asks you to connect a mailbox, Stripe and an address; below it, Stage Build, Money left $50 of $50, Earned $0, Days left to go live 14.");
console.log("\nThat's the walkthrough. Look around as long as you like; Ctrl+C stops it and deletes its data.");
await new Promise(() => {});
