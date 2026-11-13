// SPDX-License-Identifier: Apache-2.0
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';

/** The way to the GitHub section of « My account », where the person links their GitHub account. */
export function GithubLinkAction(): ReactElement {
  const { t } = useTranslation();
  return (
    <Link to="/account" hash="github">
      {t('account.title')}
    </Link>
  );
}

/**
 * Why a yes waits (Q-GATES-G1 a): the pull request's author is linked to no Ostrom person, so only an approver who
 * linked their own GitHub account may say yes. A no stays open.
 */
export function GithubLinkNotice({ count }: { readonly count: number }): ReactElement {
  const { t } = useTranslation();
  return (
    <Banner tone="warning" tag={t('yes.githubLink.tag')}>
      <span>{t('yes.githubLink.body', { count })}</span> <GithubLinkAction />
    </Banner>
  );
}
