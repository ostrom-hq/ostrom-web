// SPDX-License-Identifier: AGPL-3.0-only
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner, type BannerTone } from '@/shared/ui/Banner';
import type { AnswerNotice as Notice } from '../model';
import type { AnswerRefusal } from '../useConfirmation';

const TONES: Readonly<Record<Notice, BannerTone>> = {
  'step-up': 'warning',
  forbidden: 'danger',
  closed: 'warning',
  stale: 'warning',
  expired: 'warning',
  failed: 'danger',
  error: 'danger',
};

export interface AnswerNoticeProps {
  readonly refusal: AnswerRefusal | undefined;
  /** This page, where a fresh sign-in comes back to. */
  readonly here: string;
}

/** Why the answer was not taken, said once; the page below already shows where the confirmation ended. */
export function AnswerNotice({ refusal, here }: AnswerNoticeProps): ReactElement | null {
  const { t } = useTranslation();
  if (refusal === undefined) return null;
  const { notice, message } = refusal;
  return (
    <Banner tone={TONES[notice]} tag={t(`confirm.notice.tag.${notice}`)} live>
      {t(`confirm.notice.text.${notice}`, { reason: message })}
      {notice === 'step-up' ? (
        <>
          {' '}
          {/* A fresh sign-in, GitHub or an e-mailed link, then back to this very confirmation. */}
          <Link to="/signin" search={{ redirect: here }}>
            {t('confirm.notice.signInAgain')}
          </Link>
        </>
      ) : null}
    </Banner>
  );
}
