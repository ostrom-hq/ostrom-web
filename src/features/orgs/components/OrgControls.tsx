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
  const name = org.current?.name;
  if (!org.relevant) return null;
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
          choices={org.choices}
          currentId={org.currentId}
          unknown={org.unknown}
          onChoose={org.choose}
          onClose={org.close}
        />
      ) : null}
    </>
  );
}
