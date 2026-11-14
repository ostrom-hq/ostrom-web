// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Badge } from '@/shared/ui/Badge';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { FailureText } from '@/shared/ui/FailureText';
import { LoadState, Section } from '@/shared/ui/Screen';
import type { GithubLinkViewModel } from '../useAccount';

/**
 * Whether the person's GitHub is linked to their account, and the way to link it. A gate knows a pull request is
 * theirs only through that link: an approver whose GitHub is linked is never taken for its author (Q-GATES-G1).
 */
export function GithubLinkSection({ view }: { readonly view: GithubLinkViewModel }): ReactElement {
  const { t } = useTranslation();
  return (
    <Section id="github" label={t('account.github.title')}>
      <LoadState data={view.account} failure={view.failure} rows={1}>
        {() =>
          view.linked ? (
            <p className="o-inline">
              <Badge tone="success">{t('account.github.linkedTag')}</Badge> {t('account.github.linked')}
            </p>
          ) : (
            <>
              <p>{t('account.github.invite')}</p>
              <span className="o-self-start">
                <Button onClick={view.link} disabled={view.linking}>
                  {view.linking ? t('account.github.linking') : t('account.github.link')}
                </Button>
              </span>
            </>
          )
        }
      </LoadState>
      {view.linkFailure === undefined ? null : (
        <Banner tone="danger" tag={t('account.github.errorTag')} live>
          <FailureText failure={view.linkFailure} />
        </Banner>
      )}
      {view.unsafePage ? (
        <Banner tone="danger" tag={t('account.github.errorTag')} live>
          {t('account.github.unsafe')}
        </Banner>
      ) : null}
    </Section>
  );
}
