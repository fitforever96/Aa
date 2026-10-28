"use client";

/** Shared motion helpers. Everything respects the system Reduce Motion setting. */

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A short vibration on supporting devices (Android). iPhone web apps can't vibrate; the visual press covers it. */
export function haptic(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {}
}

type VT = { finished: Promise<void> };
type DocWithVT = Document & { startViewTransition?: (cb: () => Promise<void>) => VT };

/**
 * Open a page so the tapped card grows into its header (View Transitions, iOS 18+ / modern browsers).
 * Falls back to a normal navigation everywhere else.
 */
export function openWithTransition(push: (href: string) => void, href: string, from: HTMLElement | null) {
  const doc = document as DocWithVT;
  if (!doc.startViewTransition || reducedMotion() || !from) return push(href);
  const id = new URLSearchParams(href.split("?")[1] ?? "").get("id");
  from.style.viewTransitionName = "open-card";
  document.documentElement.dataset.vt = "1";
  const t = doc.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        from.style.viewTransitionName = "";
        push(href);
        const start = performance.now();
        const check = () => {
          const target = document.querySelector<HTMLElement>("[data-vt-target]");
          const arrived = !id || window.location.search.includes(id);
          if (arrived && target) {
            target.style.viewTransitionName = "open-card";
            resolve();
          } else if (performance.now() - start > 1200) resolve();
          else setTimeout(check, 16);
        };
        // Timers, not animation frames: the browser pauses frames while a view transition captures the new page.
        setTimeout(check, 16);
      }),
  );
  t.finished.finally(() => {
    document.querySelectorAll<HTMLElement>("[data-vt-target]").forEach((el) => (el.style.viewTransitionName = ""));
    delete document.documentElement.dataset.vt;
  });
}
