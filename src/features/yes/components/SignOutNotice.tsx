// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { useSignOut } from '../signOut';

/** `/yes?signout` asks before it ends the session: the address alone may come from another site. */
export function SignOutNotice(): ReactElement | null {
  const { t } = useTranslation();
  const { asked, signOut, stay, signingOut, failure } = useSignOut();
  if (!asked) return null;
  return (
    <Banner tone={failure === undefined ? 'warning' : 'danger'} tag={t('yes.signout.tag')} live>
      <span className="ys-signin">
        <span>
          {failure === undefined
            ? t('yes.signout.ask')
            : t('yes.signout.failed', { reason: failure.message })}
        </span>
        <span className="ys-signin__actions">
          <Button onClick={signOut} disabled={signingOut}>
            {signingOut ? t('yes.signout.going') : t('yes.signout.go')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void stay();
            }}
            disabled={signingOut}
          >
            {t('yes.signout.stay')}
          </Button>
        </span>
      </span>
    </Banner>
  );
}
