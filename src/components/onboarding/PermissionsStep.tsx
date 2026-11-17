// The first run's last screen on a Mac: the permissions a bot needs to use this Mac, each one press away, all skippable.
import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "../../icons";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { MAC_PERMISSIONS, screenNeedsReopen, type MacPermission, type MacPermissionStatus, type MacPermissionsBridge } from "@/lib/mac-permissions";
import { Art, type ArtName } from "../ui/Art";
import { PRIMARY, QUIET, StepArt, StepFrame } from "./FunnelSteps";

/** How often the screen reads the grants while it is open: they are made in System Settings, outside this window. */
export const PERMISSIONS_POLL_MS = 1_500;

const ROWS: Record<MacPermission, { art: ArtName; name: Parameters<typeof t>[0]; why: Parameters<typeof t>[0] }> = {
  accessibility: { art: "click", name: "funnel.permissions.accessibility", why: "funnel.permissions.accessibilityWhy" },
  screen: { art: "computer", name: "funnel.permissions.screen", why: "funnel.permissions.screenWhy" },
  notifications: { art: "bubbles", name: "funnel.permissions.notifications", why: "funnel.permissions.notificationsWhy" },
};

export function PermissionsStep({ bridge, onNext, relaunch, kinds = MAC_PERMISSIONS, copy }: {
  bridge: MacPermissionsBridge;
  /** the permissions offered; all three unless a run asks for fewer */
  kinds?: readonly MacPermission[];
  copy?: { title: string; sub: string };
  /** on to the app; `granted`: how many were on when the person left */
  onNext: (how: "continue" | "later", granted: number) => void;
  /** reopens the app, for Screen Recording to take effect; absent where the app can't */
  relaunch?: (() => void) | null;
}) {
  const [status, setStatus] = useState<MacPermissionStatus | null>(null);
  const [busy, setBusy] = useState<MacPermission | null>(null);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  const read = useCallback(() => {
    void bridge.status().then((next) => { if (live.current) setStatus(next); }, () => {});
  }, [bridge]);
  useEffect(() => {
    read();
    const timer = setInterval(read, PERMISSIONS_POLL_MS);
    window.addEventListener("focus", read);
    return () => { clearInterval(timer); window.removeEventListener("focus", read); };
  }, [read]);

  const ask = async (kind: MacPermission) => {
    setBusy(kind);
    try {
      const note = kind === "notifications" ? { title: t("funnel.permissions.noteTitle"), body: t("funnel.permissions.noteBody") } : undefined;
      const next = await bridge.request(kind, note);
      if (live.current) setStatus(next);
    } catch {
      read();
    } finally {
      if (live.current) setBusy(null);
    }
  };

  const shown = status?.supported ? status : null;
  const granted = shown ? kinds.filter((kind) => shown[kind] === "granted").length : 0;
  const leave = (how: "continue" | "later") => onNext(how, granted);

  return (
    <div className="my-auto w-full">
      {/* top right, across from Back, and quiet: Continue is the way on */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-14 items-center justify-end px-4">
        <button type="button" data-funnel-permissions-later="" onClick={() => leave("later")}
          className={cn(QUIET, "pointer-events-auto text-[12px] opacity-40 hover:opacity-70 focus-visible:opacity-100")}>{t("funnel.permissions.later")}</button>
      </div>
      <StepFrame art={<StepArt art="mac-key" />} title={copy?.title ?? t("funnel.permissions.title")} sub={copy?.sub ?? t("funnel.permissions.sub")}
        footer={<button type="button" data-primary="" data-funnel-permissions-continue="" onClick={() => leave("continue")} className={PRIMARY}>{t("funnel.next")}</button>}>
        <ul className="-mt-2 flex w-full max-w-[420px] flex-col gap-1.5 text-start">
          {kinds.map((kind) => {
            const row = ROWS[kind];
            const state = shown?.[kind] ?? "missing";
            return (
              <li key={kind} data-permission={kind} data-permission-state={state}
                className="flex min-h-14 items-center gap-3.5 rounded-2xl bg-ink/[0.035] py-2.5 pe-2.5 ps-4">
                <Art name={row.art} className="size-8 object-contain" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[14px] font-medium leading-5 text-ink">{t(row.name)}</span>
                  <span className="text-[13px] leading-[18px] text-ink-secondary">{t(row.why)}</span>
                </span>
                {state === "granted" ? (
                  <span role="img" aria-label={t("funnel.permissions.allowed")} className="place-mark grid size-9 shrink-0 place-items-center rounded-full bg-success/10 text-success">
                    <Check size={18} aria-hidden="true" />
                  </span>
                ) : (
                  <button type="button" data-permission-ask={kind} disabled={busy !== null || !shown}
                    aria-label={`${t(state === "asked" ? "funnel.permissions.openSettings" : "funnel.permissions.allow")}: ${t(row.name)}`}
                    onClick={() => void ask(kind)}
                    className="ui-button ui-button-pill min-h-9 shrink-0 whitespace-nowrap bg-ink/[0.07] px-4 hover:bg-ink/[0.11] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-[0.97] disabled:opacity-50 motion-reduce:active:scale-100">
                    {t(state === "asked" ? "funnel.permissions.openSettings" : "funnel.permissions.allow")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {screenNeedsReopen(shown) && (
          <p data-permissions-reopen="" className="mt-4 flex max-w-[420px] flex-wrap items-center justify-center gap-x-1 text-[13px] leading-[18px] text-ink-secondary">
            {t("funnel.permissions.reopenLine")}
            {relaunch && <button type="button" onClick={relaunch} className={cn(QUIET, "min-h-0 px-1.5 py-0.5 text-ink underline-offset-2 hover:underline")}>{t("funnel.permissions.reopen")}</button>}
          </p>
        )}
      </StepFrame>
    </div>
  );
}
