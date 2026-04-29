import { useEffect } from "react";

/**
 * Workaround for a known Radix UI bug where closing a Dialog / Sheet / Popover
 * sometimes leaves `style="pointer-events: none"` on <body>, which silently
 * disables every click on the page (including the navbar three-dot
 * role-switch dropdown).
 *
 * Issue references:
 *  - https://github.com/radix-ui/primitives/issues/2122
 *  - https://github.com/radix-ui/primitives/issues/1241
 *
 * We watch the body style attribute for changes. If `pointer-events: none`
 * is set but no Radix overlay component is actually mounted in an open
 * state, we clear it. This is safe because Radix only sets the lock while
 * one of these components is open.
 */
export function useBodyPointerEventsCleanup() {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const body = document.body;

    const isAnyRadixOverlayOpen = () => {
      // Radix sets data-state="open" on the open overlay element. Sheets,
      // Dialogs, and Popovers all expose this attribute on their content
      // (or trigger), so it's a reliable signal that the lock is intentional.
      return !!document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-radix-popper-content-wrapper] [data-state="open"]',
      );
    };

    const clearIfStuck = () => {
      if (
        body.style.pointerEvents === "none" &&
        !isAnyRadixOverlayOpen()
      ) {
        body.style.pointerEvents = "";
      }
    };

    // Initial pass on mount in case we're already stuck.
    clearIfStuck();

    const observer = new MutationObserver(() => {
      clearIfStuck();
    });

    observer.observe(body, {
      attributes: true,
      attributeFilter: ["style"],
    });

    return () => observer.disconnect();
  }, []);
}
