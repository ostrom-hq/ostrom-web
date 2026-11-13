// SPDX-License-Identifier: AGPL-3.0-only
import { Link } from '@tanstack/react-router';
import { type ReactElement, type RefObject, useCallback, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { useModal } from '@/shared/ui/useModal';
import { NavLabel } from '@/app/NavLabel';
import { useNavLinks } from '@/app/useNavLinks';

/**
 * The navigation on a phone, where the bar has no room for it: a button that opens every screen in a sheet, modal
 * (Escape or Close shuts it, the focus comes back to the button). Hidden on a wide screen, where the bar shows them.
 */
export function NavMenu(): ReactElement {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
  }, []);
  return (
    <span className="o-nav-menu-toggle">
      <Button
        ref={button}
        variant="ghost"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
        }}
      >
        <span aria-hidden="true">☰</span>
        {t('app.nav.menu')}
      </Button>
      {open ? <NavSheet onClose={close} opener={button} /> : null}
    </span>
  );
}

function NavSheet({
  onClose,
  opener,
}: {
  readonly onClose: () => void;
  readonly opener: RefObject<HTMLButtonElement | null>;
}): ReactElement {
  const { t } = useTranslation();
  const overlay = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const links = useNavLinks();
  useModal(overlay, panel, onClose, opener);
  return createPortal(
    <div ref={overlay} className="o-nav-menu">
      <div
        ref={panel}
        className="o-nav-menu__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="o-nav-menu__head">
          <h2 id={titleId} className="o-nav-menu__title">
            {t('app.nav.menu')}
          </h2>
          <Button variant="ghost" onClick={onClose}>
            {t('app.nav.close')}
          </Button>
        </div>
        <nav aria-label={t('app.nav.label')}>
          <ul className="o-nav-menu__list">
            {links.map((link) => (
              <li key={link.to}>
                <Link to={link.to} activeOptions={{ exact: link.to === '/' }} onClick={onClose}>
                  <NavLabel label={link.label} />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>,
    document.body,
  );
}
