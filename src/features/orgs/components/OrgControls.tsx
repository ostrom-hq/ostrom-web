// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactElement, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/shared/ui/Avatar';
import { Button } from '@/shared/ui/Button';
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
      <Button
        variant="ghost"
        aria-haspopup="dialog"
        aria-label={name === undefined ? t('orgs.switch.choose') : t('orgs.switch.named', { name })}
        aria-describedby={signedIn === undefined ? undefined : viewerId}
        onClick={org.open}
      >
        <Avatar login={name} size={20} />
        <span className="o-org-switch__text">
          <span className="o-org-switch__name">{name ?? t('orgs.switch.unnamed')}</span>
          {/*
           * Who the person is there, as `/auth/me` answers with the organization named: their name and role. Read as
           * the button's description, not as its name: hidden from the name, which stays the label shown above it
           * (WCAG 2.5.3, label in name), and still read through `aria-describedby`, which reads hidden elements.
           */}
          {signedIn === undefined ? null : (
            <span id={viewerId} className="o-org-switch__viewer" aria-hidden="true">
              {signedIn}
            </span>
          )}
        </span>
      </Button>
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
