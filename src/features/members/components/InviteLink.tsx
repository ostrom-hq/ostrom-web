// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OrgRole } from '@/shared/org/roles';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { CopyField } from '@/shared/ui/CopyField';
import { Section } from '@/shared/ui/Screen';
import { LINK_DEFAULT_USES, LINK_MAX_USES } from '../model';
import type { InviteLinkViewModel } from '../useMembers';
import { RoleSelect } from './RoleSelect';
import { FailureText } from '@/shared/ui/FailureText';

export interface InviteLinkProps {
  readonly link: InviteLinkViewModel;
  readonly roles: readonly OrgRole[];
}

/** The uses a typed value stands for: a whole number from 1 to 100, 1 when nothing readable is typed. */
function usesOf(typed: string): number {
  const value = Number.parseInt(typed, 10);
  return Number.isNaN(value) ? 1 : Math.min(LINK_MAX_USES, Math.max(1, value));
}

/** A link anyone signed in can use a set number of times, shown once: it carries the secret. */
export function InviteLink({ link, roles }: InviteLinkProps): ReactElement {
  const { t } = useTranslation();
  const [role, setRole] = useState<OrgRole>('member');
  // What is typed, kept as typed (an empty field included) and read as 1 to 100 uses on blur and on submit.
  const [typed, setTyped] = useState(String(LINK_DEFAULT_USES));
  const uses = usesOf(typed);
  const usesId = useId();
  return (
    <Section label={t('members.link.title')}>
      <p className="o-row__meta">{t('members.link.lead')}</p>
      <form
        className="o-inline"
        onSubmit={(event) => {
          event.preventDefault();
          setTyped(String(uses));
          link.create(role, uses);
        }}
      >
        <RoleSelect label={t('members.link.as')} roles={roles} value={role} onChange={setRole} />
        <label htmlFor={usesId} className="o-field-label">
          {t('members.link.uses')}
        </label>
        <input
          id={usesId}
          className="o-input o-input--narrow"
          type="number"
          inputMode="numeric"
          min={1}
          max={LINK_MAX_USES}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
          }}
          onBlur={() => {
            setTyped(String(uses));
          }}
        />
        <Button type="submit" disabled={link.creating}>
          {link.creating ? t('members.link.creating') : t('members.link.create')}
        </Button>
      </form>
      {link.link === undefined ? null : (
        <Banner tone="warning" tag={t('members.link.onceTag')} live>
          <span className="o-stack">
            <span>{t('members.link.once', { count: link.link.invitation.maxUses ?? uses })}</span>
            <CopyField label={t('members.link.title')} value={link.link.url} />
          </span>
        </Banner>
      )}
      {link.failure === undefined ? null : (
        <Banner tone="danger" tag={t('members.link.errorTag')} live>
          <FailureText failure={link.failure} />
        </Banner>
      )}
    </Section>
  );
}
