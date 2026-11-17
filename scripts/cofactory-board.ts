// `pnpm cofactory:board [--url http://127.0.0.1:8799] [--watch SECONDS]`: prints the internal ops board of a running
// dusk server (one row per company, then live sessions and alarms). The same board is a page at /api/cofactory/board.
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { url: { type: "string", default: "http://127.0.0.1:8799" }, watch: { type: "string" } } });
const base = values.url!.replace(/\/$/, "");
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d{1,5}$/.test(base)) {
  console.error("cofactory:board: --url must be http://127.0.0.1:PORT, a server on this computer");
  process.exit(2);
}

async function print(): Promise<boolean> {
  try {
    const response = await fetch(`${base}/api/cofactory/board.txt`);
    if (!response.ok) {
      console.error(`cofactory:board: ${response.status} ${await response.text()}`);
      return false;
    }
    console.log(await response.text());
    return true;
  } catch (error) {
    console.error(`cofactory:board: no dusk server at ${base} (${error instanceof Error ? error.message : String(error)})`);
    return false;
  }
}

const seconds = Number(values.watch);
if (!(seconds > 0)) process.exit((await print()) ? 0 : 1);
for (;;) {
  console.clear();
  await print();
  await new Promise((resolve) => setTimeout(resolve, seconds * 1_000));
}
