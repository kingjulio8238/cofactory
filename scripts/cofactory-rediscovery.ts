// `pnpm cofactory:rediscovery --url http://127.0.0.1:PORT --target N [--niches K]`: one live rediscovery run. It sets the
// factory profile from target N's domain alone (docs/cofactory/research/rediscovery/targets.json), starts a discovery
// batch of K niches, waits for the scout to close it, and prints whether the target's niche was found.
// `--score` instead prints recall over every run recorded in docs/cofactory/research/rediscovery/runs.jsonl.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { profileFor, rediscoveryRecall, type RediscoveryTarget } from "../server/cofactory/evals/rediscovery.ts";

const ROOT = new URL("../docs/cofactory/research/rediscovery/", import.meta.url);
const targets = JSON.parse(readFileSync(new URL("targets.json", ROOT), "utf8")) as RediscoveryTarget[];
const runsFile = new URL("runs.jsonl", ROOT);
const { values } = parseArgs({ options: { url: { type: "string", default: "http://127.0.0.1:8911" }, target: { type: "string" }, niches: { type: "string", default: "5" }, score: { type: "boolean", default: false } } });

if (values.score) {
  const current = profileFor(targets[0]!).inputs.map((input) => input.text.replace(targets[0]!.domain, "<domain>"));
  const runs = (existsSync(runsFile) ? readFileSync(runsFile, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [])
    .filter((run: { target: RediscoveryTarget; profile?: string[] }) => JSON.stringify(run.profile?.map((text) => text.replace(run.target.domain, "<domain>"))) === JSON.stringify(current));
  console.log(JSON.stringify(rediscoveryRecall(runs), null, 2));
  process.exit(0);
}

const target = targets[Number(values.target)];
if (!target) { console.error(`--target must be 0..${targets.length - 1}`); process.exit(2); }
const base = values.url!.replace(/\/$/, "");
const call = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return response.json() as Promise<Record<string, any>>;
};

console.log(`target ${values.target}: ${target.name} (${target.buyer} · ${target.job}); profile domain "${target.domain}"`);
await call("POST", "/api/cofactory/profile", profileFor(target));
const started = await call("POST", "/api/cofactory/discovery/batches", { note: "rediscovery run: find extremely niche businesses in this domain", target: Number(values.niches) });
if (!started.ok) { console.error(started.reason); process.exit(1); }
const batchId = started.batch.id as string;
const deadline = Date.now() + 60 * 60_000;
for (;;) {
  const discovery = await call("GET", "/api/cofactory/discovery");
  const batch = discovery.batches.find((candidate: { id: string }) => candidate.id === batchId);
  const live = (await call("GET", "/api/cofactory/state")).runtime?.liveSessions?.length ?? 0;
  if (batch?.closedAt) break;
  const stuck = (await call("GET", "/api/cofactory/state")).runtime?.alarms?.some((alarm: { kind: string }) => alarm.kind === "discovery_stuck");
  if (stuck && !live) {
    console.error("the scout used its sessions without filling the batch; abandoning it");
    await call("POST", "/api/cofactory/discovery/abandon");
    break;
  }
  if (Date.now() > deadline) {
    console.error("timed out after 60 minutes; abandoning the batch");
    await call("POST", "/api/cofactory/discovery/abandon");
    break;
  }
  console.log(`${new Date().toISOString().slice(11, 19)} niches ${discovery.batch?.niches ?? 0}, signals ${discovery.batch?.signals ?? 0}, live sessions ${live}`);
  await new Promise((resolve) => setTimeout(resolve, 60_000));
}
const niches = (await call("GET", "/api/cofactory/discovery")).niches.filter((niche: { batchId: string }) => niche.batchId === batchId);
const run = { target, profile: profileFor(target).inputs.map((input) => input.text), candidates: niches.map((niche: { buyer: string; job: string }) => ({ buyer: niche.buyer, job: niche.job })), at: new Date().toISOString() };
appendFileSync(runsFile, `${JSON.stringify(run)}\n`);
console.log(JSON.stringify(rediscoveryRecall([run]), null, 2));
