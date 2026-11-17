import { decodeEntities } from "../../link-preview/meta.ts";

const DROPPED = /<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1\s*>/gi;
const BLOCK = /<\/?(p|div|br|li|ul|ol|h[1-6]|tr|td|th|table|section|article|header|footer|blockquote|pre|hr)\b[^>]*>/gi;

/** The readable text of an HTML page: scripts and styles dropped, tags removed, entities decoded. */
export function htmlToText(html: string): string {
  const withoutHidden = html.replace(/<!--[\s\S]*?-->/g, " ").replace(DROPPED, " ");
  const blocks = withoutHidden.replace(BLOCK, "\n").replace(/<[^>]+>/g, "");
  return decodeEntities(blocks).replace(/[ \t\f\v ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

/** Folds the differences a faithful quote may have from its page: case, curly quotes, dashes, spacing, Unicode forms. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

const ELLIPSIS = /\s*(?:\.\.\.|…|\[\s*(?:\.\.\.|…)\s*\])\s*/;

/** Whether `quote` appears on a page. An elided quote ("a ... b") must have every part, in order, each long enough to mean something. */
export function quoteAppears(quote: string, pageText: string): { found: boolean; reason: string } {
  const page = normalizeForMatch(pageText);
  const parts = normalizeForMatch(quote.replace(/^["'“‘]+|["'”’]+$/g, "")).split(ELLIPSIS).map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return { found: false, reason: "empty quote" };
  if (parts.some((part) => part.split(" ").length < 3)) return { found: false, reason: "a quoted fragment is under three words, too short to prove anything" };
  let from = 0;
  for (const part of parts) {
    const at = page.indexOf(part, from);
    if (at < 0) return { found: false, reason: parts.length > 1 ? `the fragment "${part.slice(0, 60)}" is not on the page after the earlier ones` : "not on the page" };
    from = at + part.length;
  }
  return { found: true, reason: "on the page" };
}
