import { cloudName, productName } from "@/lib/brand";
import { en, loadLocalePack, localeChoices, localePacks, locales, type LocaleKey, type LocalePack } from "@/locales";

export function resolveLocale(tag: string | undefined, available: ReadonlySet<string>): string {
  if (!tag) return "en";
  let candidate = tag.toLowerCase();
  while (candidate) {
    if (available.has(candidate)) return candidate;
    const separator = candidate.lastIndexOf("-");
    if (separator < 0) break;
    candidate = candidate.slice(0, separator);
  }
  return "en";
}

const RTL_LANGUAGES = new Set(["ar", "fa", "he", "ur"]);

/** Every tag a pack is shown for, loaded or not. */
export function knownLocales(): Set<string> {
  return new Set([...Object.keys(localePacks), ...Object.keys(locales)]);
}

/** Shows `tag`'s language when its pack is loaded (loadLocale), English otherwise; returns the locale that took effect. */
export function setLocale(tag: string | undefined): string {
  switches += 1;
  return show(resolveLocale(tag, new Set(Object.keys(locales))));
}

/** Loads `tag`'s pack and shows it, unless another language was asked for meanwhile; until then the page keeps the
 * language it shows. Resolves to the locale shown. */
export async function loadLocale(tag: string | undefined): Promise<string> {
  const asked = ++switches;
  await loadLocalePack(resolveLocale(tag, knownLocales())).catch(() => undefined);
  return asked === switches ? show(resolveLocale(tag, new Set(Object.keys(locales)))) : active;
}

function show(resolved: string): string {
  activePack = locales[resolved] ?? en;
  active = resolved;
  // Screen readers choose pronunciation from <html lang>, and index.html ships "en".
  const root = typeof document === "undefined" ? undefined : document?.documentElement;
  if (root) {
    root.lang = documentLanguage(resolved);
    root.dir = RTL_LANGUAGES.has(root.lang.split("-")[0]!) ? "rtl" : "ltr";
  }
  return resolved;
}

export function documentLanguage(code: string): string {
  const pack = localePacks[code];
  const shown = (pack && localeChoices.find((choice) => localePacks[choice.code] === pack)?.code) || code;
  return shown
    .split("-")
    .map((part, index) =>
      index === 0 ? part.toLowerCase()
        : part.length === 2 ? part.toUpperCase()
          : part.length === 4 ? part[0]!.toUpperCase() + part.slice(1).toLowerCase()
            : part.toLowerCase())
    .join("-");
}

/** React cannot see the module variable t() reads, so memoized subtrees take this as a prop. */
export function activeLocale(): string {
  return active;
}

let active = "en";
let activePack: LocalePack = en;
let switches = 0;

export function tFromServer(key: string | undefined, fallback: string | undefined): string | undefined {
  return key && Object.hasOwn(en, key) ? t(key as LocaleKey) : fallback;
}

/** A newer English wording where the active language has it, else an older key it already translated: new copy never
 * turns a translated screen back into English. */
export function tPreferred(key: LocaleKey, translated: LocaleKey, params?: Record<string, string | number>): string {
  return active === "en" || activePack[key] !== undefined || activePack[translated] === undefined ? t(key, params) : t(translated, params);
}

/** A line that is only worth showing in the active language: nothing where it has not been translated yet. */
export function tOptional(key: LocaleKey, params?: Record<string, string | number>): string | undefined {
  return active === "en" || activePack[key] !== undefined ? t(key, params) : undefined;
}

/** What people call the computer this app runs on: "Mac", "PC" (Windows), else "computer". */
export function deviceWord(platform: string | undefined = desktopPlatform()): string {
  return t(platform === "darwin" ? "vpsLink.device.mac" : platform === "win32" ? "vpsLink.device.pc" : "vpsLink.device.computer");
}

function desktopPlatform(): string | undefined {
  if (typeof window !== "undefined" && window.duskDesktop?.platform) return window.duskDesktop.platform;
  const agent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  return /Mac OS X|Macintosh/.test(agent) && !/iPhone|iPad/.test(agent) ? "darwin" : /Windows/.test(agent) ? "win32" : undefined;
}

/** `{app}` is the product's name as a person reads it (productName), `{device}` this computer's word (deviceWord), unless
 * `params` names them. */
export function t(key: LocaleKey, params?: Record<string, string | number>): string {
  const template = activePack[key] ?? en[key];
  if (!params && !template.includes("{")) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    params && name in params ? String(params[name]) : name === "app" ? productName() : name === "cloud" ? cloudName() : name === "device" ? deviceWord() : match,
  );
}
