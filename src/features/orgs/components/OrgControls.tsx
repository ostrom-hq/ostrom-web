// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/shared/ui/Avatar';
import { Button } from '@/shared/ui/Button';
import { useOrgPicker } from '../useOrgPicker';
import { OrgPicker } from './OrgPicker';

/** The organization the console acts in, in the top bar, and the picker it opens. */
export function OrgControls(): ReactElement | null {
  const { t } = useTranslation();
  const org = useOrgPicker();
  if (!org.relevant) return null;
  const name = org.current?.name;
  return (
    <>
      <Button
        variant="ghost"
        aria-haspopup="dialog"
        aria-label={name === undefined ? t('orgs.switch.choose') : t('orgs.switch.named', { name })}
        onClick={org.open}
      >
        <Avatar login={name} size={20} />
        <span className="o-org-switch__name">{name ?? t('orgs.switch.unnamed')}</span>
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
