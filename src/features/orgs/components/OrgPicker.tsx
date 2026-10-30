// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactElement, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/shared/ui/Avatar';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import type { OrgOption } from '../useOrgPicker';

export interface OrgPickerProps {
  readonly options: readonly OrgOption[];
  readonly loading: boolean;
  readonly failure: Error | undefined;
  /** The organization chosen before is not one of the person's any more. */
  readonly unknown: boolean;
  readonly onClose: () => void;
}

/** Which of the person's organizations the console acts in: a dialog over the console, a sheet on a phone. */
export function OrgPicker({ options, loading, failure, unknown, onClose }: OrgPickerProps): ReactElement {
  const { t } = useTranslation();
  const overlay = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    // Modal for real: the rest of the page cannot be reached while it is open, and focus goes back where it was.
    const opener = document.activeElement;
    const behind = [...document.body.children].filter(
      (child) => child !== overlay.current && !child.hasAttribute('inert'),
    );
    for (const element of behind) element.setAttribute('inert', '');
    panel.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      for (const element of behind) element.removeAttribute('inert');
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [onClose]);
  return createPortal(
    <div ref={overlay} className="o-org-picker">
      <div
        ref={panel}
        className="o-org-picker__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={loading}
        tabIndex={-1}
      >
        <h2 id={titleId} className="o-org-picker__title">
          {t('orgs.picker.title')}
        </h2>
        <p className="o-org-picker__body">{t('orgs.picker.body')}</p>
        {unknown ? (
          <Banner tone="warning" tag={t('orgs.picker.problemTag')}>
            {t('orgs.picker.unknown')}
          </Banner>
        ) : null}
        {failure === undefined ? null : (
          <Banner tone="danger" tag={t('orgs.picker.problemTag')} live>
            {t('orgs.picker.failed')}
          </Banner>
        )}
        {loading ? <p className="o-org-picker__body">{t('app.loading')}</p> : null}
        {options.length > 0 ? (
          <ul className="o-org-picker__list" aria-label={t('orgs.picker.known')}>
            {options.map((option) => (
              <li key={option.organization.id}>
                <Button aria-current={option.current ? 'true' : undefined} onClick={option.choose}>
                  <Avatar login={option.organization.name} size={22} />
                  <span>{option.organization.name}</span>
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="o-inline">
          <Button variant="ghost" onClick={onClose}>
            {t('orgs.picker.notNow')}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
