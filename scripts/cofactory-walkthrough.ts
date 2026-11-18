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

import { scriptFirstSearch, searchToCards, startScriptedFactory } from "../server/cofactory/testing/scripted-factory.ts";

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
step(3, "\"Your factory is open\" lists the industries it picked. Click See your first companies.");
const HOUR = 60 * 60_000;
await factory.until("the factory to open", async () => (await factory.call("GET", "/api/cofactory/settings")).settings?.onboardedAt, HOUR);
step(4, "Home, \"Pick your first companies\": the scout's search line, then \"Checking the evidence\" rows, then three cards fill in.");
await searchToCards(factory);
step(5, "Riverside Recon, Appeal Desk and Binder Keep are ready. Open See the evidence on one. Pass on Appeal Desk and say why.");
step(6, "Start Riverside Recon with $50. Its card says it's confirming the details, then that it's open, with an Open button.");
await factory.until("you to start a company", async () => ((await factory.call("GET", "/api/cofactory/state")).companies as unknown[]).length > 0, HOUR);
step(7, "Riverside Recon appears on the left rail, a character in the company's own colour, within about 10 seconds.");
step(8, "Click Open Riverside Recon (or its rail icon): the sidebar shows only its crew and the CEO's chat opens. The top rail icon goes back to Home.");
step(9, "Open the CEO's panel → Factory: Needs you asks you to connect a mailbox, Stripe and an address; below it, Stage Build, Money left $50 of $50, Earned $0, Days left to go live 14.");
console.log("\nThat's the walkthrough. Look around as long as you like; Ctrl+C stops it and deletes its data.");
await new Promise(() => {});
