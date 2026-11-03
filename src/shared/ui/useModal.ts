// SPDX-License-Identifier: AGPL-3.0-only
import { type RefObject, useEffect } from 'react';

/** What the keyboard can reach in a panel. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A dialog modal for real while it is mounted: everything else in the page is inert (a screen reader reads nothing
 * else), the panel takes the focus and Tab goes round inside it, Escape closes it, and the focus goes back where it
 * was.
 */
export function useModal(
  overlay: RefObject<HTMLElement | null>,
  panel: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    const opener = document.activeElement;
    const behind = [...document.body.children].filter(
      (child) => child !== overlay.current && !child.hasAttribute('inert'),
    );
    for (const element of behind) element.setAttribute('inert', '');
    panel.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const [first, ...rest] = [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      if (first === undefined) return;
      const last = rest.at(-1) ?? first;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      for (const element of behind) element.removeAttribute('inert');
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [overlay, panel, onClose]);
}
