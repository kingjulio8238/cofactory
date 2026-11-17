import { execFile } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";

import type { JournalEntry } from "../../../shared/cofactory/runtime.ts";

const run = promisify(execFile);
/** A packaged app or a sealed fixture may run with a PATH that lacks git, so the usual install places are tried too. */
const GIT_PLACES = ["/usr/bin/git", "/opt/homebrew/bin/git", "/usr/local/bin/git"];

function findGit(): string | null {
  const onPath = (process.env.PATH ?? "").split(delimiter).filter(Boolean).map((dir) => join(dir, process.platform === "win32" ? "git.exe" : "git"));
  return [...onPath, ...GIT_PLACES].find((candidate) => existsSync(candidate)) ?? null;
}
const GIT_ENV = {
  GIT_AUTHOR_NAME: "Cofactory runtime", GIT_AUTHOR_EMAIL: "runtime@cofactory.invalid",
  GIT_COMMITTER_NAME: "Cofactory runtime", GIT_COMMITTER_EMAIL: "runtime@cofactory.invalid",
};

/**
 * Each company's folder: BRIEF.md (the rules every session starts from), JOURNAL.md (append-only, written by code from
 * journal entries) and whatever the team builds. It is a git repository committed at the end of every session, so
 * any session can be traced and restored.
 */
export function createWorkspaces(root: string, options: { git?: boolean } = {}) {
  const gitPath = options.git === false ? null : findGit();
  const dirOf = (companyId: string | null) => join(root, companyId ?? "factory");

  async function git(dir: string, args: string[]): Promise<string> {
    const { stdout } = await run(gitPath!, args, { cwd: dir, env: { ...process.env, ...GIT_ENV }, timeout: 30_000 });
    return stdout.trim();
  }

  return {
    dirOf,
    /** Whether sessions are checkpointed: git was found. */
    versioned: gitPath !== null,

    async ensure(companyId: string | null, brief: string): Promise<string> {
      const dir = dirOf(companyId);
      mkdirSync(dir, { recursive: true });
      const briefFile = join(dir, "BRIEF.md");
      if (!existsSync(briefFile)) writeFileSync(briefFile, brief.endsWith("\n") ? brief : `${brief}\n`);
      if (!existsSync(join(dir, "JOURNAL.md"))) writeFileSync(join(dir, "JOURNAL.md"), "# Journal\n");
      if (gitPath && !existsSync(join(dir, ".git"))) {
        await git(dir, ["init", "-q"]);
        await git(dir, ["add", "-A"]);
        await git(dir, ["commit", "-q", "-m", "workspace created"]);
      }
      return dir;
    },

    brief(companyId: string | null): string {
      const file = join(dirOf(companyId), "BRIEF.md");
      return existsSync(file) ? readFileSync(file, "utf8") : "";
    },

    appendJournal(companyId: string | null, entry: JournalEntry): void {
      const dir = dirOf(companyId);
      mkdirSync(dir, { recursive: true });
      const when = new Date(entry.at).toISOString();
      const lines = [`\n## ${when} · ${entry.role}${entry.sessionId ? ` · session ${entry.sessionId.slice(0, 8)}` : ""}`, `- Did: ${entry.did}`];
      if (entry.learned) lines.push(`- Learned: ${entry.learned}`);
      if (entry.next) lines.push(`- Next: ${entry.next}`);
      if (entry.blockers) lines.push(`- Blockers: ${entry.blockers}`);
      appendFileSync(join(dir, "JOURNAL.md"), `${lines.join("\n")}\n`);
    },

    /** Commits whatever the session left in the folder; returns the commit, or null when nothing changed or git is off. */
    async checkpoint(companyId: string | null, message: string): Promise<string | null> {
      if (!gitPath) return null;
      const dir = dirOf(companyId);
      if (!existsSync(join(dir, ".git"))) return null;
      await git(dir, ["add", "-A"]);
      if (!(await git(dir, ["status", "--porcelain"]))) return null;
      await git(dir, ["commit", "-q", "-m", message]);
      return git(dir, ["rev-parse", "--short", "HEAD"]);
    },
  };
}

export type Workspaces = ReturnType<typeof createWorkspaces>;
