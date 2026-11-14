// SPDX-License-Identifier: Apache-2.0
import { type ReactElement, useId } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Avatar } from '@/shared/ui/Avatar';
import { useOrgPicker } from '../useOrgPicker';
import { OrgPicker } from './OrgPicker';

export interface OrgControlsProps {
  /** A page for people not signed in yet (sign-in, e-mail link): nobody is asked who they are. */
  readonly anonymousPage: boolean;
}

/** The organization the console acts in, in the top bar, and the picker it opens. */
export function OrgControls({ anonymousPage }: OrgControlsProps): ReactElement | null {
  const { t } = useTranslation();
  const org = useOrgPicker({ anonymousPage });
  const viewerId = useId();
  if (!org.relevant) return null;
  const name = org.current?.name;
  const viewer = org.viewer;
  let signedIn: string | undefined;
  if (viewer !== undefined)
    signedIn =
      viewer.role === undefined
        ? viewer.name
        : t('orgs.switch.viewer', { name: viewer.name, role: t(`members.role.${viewer.role}`) });
  return (
    <>
      {/*
       * The button holds the organization's name only, so its name says all its visible text (WCAG 2.5.3, label in
       * name): the initials before it and who the person is there, under it, are beside it. Who the person is (their
       * name and role, from `/auth/me` with the organization named) is the button's description, hidden from reading
       * on its own (`aria-describedby` reads hidden elements).
       */}
      <div className="o-org-switch">
        <Avatar login={name} size={20} />
        <button
          type="button"
          className="o-org-switch__button"
          aria-haspopup="dialog"
          aria-label={name === undefined ? t('orgs.switch.choose') : t('orgs.switch.named', { name })}
          aria-describedby={signedIn === undefined ? undefined : viewerId}
          onClick={org.open}
        >
          <span className="o-org-switch__name">{name ?? t('orgs.switch.unnamed')}</span>
        </button>
        {signedIn === undefined ? null : (
          <span id={viewerId} className="o-org-switch__viewer" aria-hidden="true">
            {signedIn}
          </span>
        )}
      </div>
      {org.picking ? (
        <OrgPicker
          options={org.options}
          loading={org.loading}
          failure={org.failure}
          onRetry={org.retry}
          unknown={org.unknown}
          onClose={org.close}
        />
      ) : null}
    </>
  );
}
