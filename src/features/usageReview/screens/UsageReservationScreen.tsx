// SPDX-License-Identifier: Apache-2.0
import type { PendingUsage, UsageReconciliation } from '@gen/api/types.gen';
import { Link, useParams } from '@tanstack/react-router';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { formatAbsolute } from '@/shared/lib/time';
import { managesMembers } from '@/shared/org/roles';
import { WithOrg } from '@/shared/org/WithOrg';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { FailureText } from '@/shared/ui/FailureText';
import { EmptyState, Facts, LoadState, Screen, Section } from '@/shared/ui/Screen';
import {
  draftReconciliation,
  EVIDENCE_SOURCES,
  formatMicros,
  isEvidenceSource,
  MAX_EVIDENCE_LENGTH,
} from '../model';
import { type UsageReservationViewModel, useUsageReservation } from '../useUsageReview';
import { AdminsOnly } from './UsageReviewScreen';

/**
 * One hold under review, with TeamCode's reconcile form, or the correction made to it. Owners and admins only; the
 * correction needs a sign-in less than five minutes old.
 */
export function UsageReservationScreen(): ReactElement {
  const { t } = useTranslation();
  return (
    <WithOrg title={t('usageReview.reviewTitle')}>
      {(_org, role) => (managesMembers(role) ? <Reservation /> : <AdminsOnly />)}
    </WithOrg>
  );
}

function Reservation(): ReactElement {
  const { t } = useTranslation();
  const { reservationId } = useParams({ from: '/usage/$reservationId' });
  const view = useUsageReservation(reservationId);
  if (view.forbidden) return <AdminsOnly />;
  return (
    <Screen title={t('usageReview.reviewTitle')}>
      <nav className="o-inline" aria-label={t('usageReview.views')}>
        <Link to="/usage">{t('usageReview.pending')}</Link>
        <Link to="/usage" search={{ view: 'history' }}>
          {t('usageReview.history')}
        </Link>
      </nav>
      {view.notFound ? (
        <EmptyState title={t('usageReview.notFoundTitle')}>{t('usageReview.notFound')}</EmptyState>
      ) : (
        <LoadState data={view.review} failure={view.failure}>
          {(review) =>
            review.pending === undefined ? (
              review.reconciliation === undefined ? (
                <EmptyState title={t('usageReview.notFoundTitle')}>{t('usageReview.notFound')}</EmptyState>
              ) : (
                <Reconciled item={review.reconciliation} />
              )
            ) : (
              <Pending
                key={`${review.pending.id}:${String(review.pending.micros)}`}
                item={review.pending}
                view={view}
              />
            )
          }
        </LoadState>
      )}
    </Screen>
  );
}

function Pending({
  item,
  view,
}: {
  readonly item: PendingUsage;
  readonly view: UsageReservationViewModel;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState('');
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const ids = { amount: useId(), source: useId(), reference: useId(), reason: useId() };
  const body = draftReconciliation({
    expectedMicros: item.micros,
    expectedProviderRequestId: item.providerRequestId,
    amount,
    source,
    reference,
    reason,
  });
  return (
    <>
      <p className="o-screen__lead">{t('usageReview.help')}</p>
      <Section label={t('usageReview.hold')}>
        <Facts
          facts={[
            { label: t('usageReview.request'), value: item.id, mono: true },
            { label: t('usageReview.memberFact'), value: item.member },
            { label: t('usageReview.charge'), value: formatMicros(item.micros, i18n.language) },
            { label: t('usageReview.heldAt'), value: formatAbsolute(item.heldAt, i18n.language) },
            {
              label: t('usageReview.leaseExpiredAt'),
              value: formatAbsolute(item.leaseExpiredAt, i18n.language),
            },
            {
              label: t('usageReview.providerRequestId'),
              value: item.providerRequestId ?? t('usageReview.notCaptured'),
              mono: true,
            },
            item.workflowId === undefined
              ? undefined
              : { label: t('usageReview.workflow'), value: item.workflowId, mono: true },
            item.launchId === undefined
              ? undefined
              : { label: t('usageReview.launch'), value: item.launchId, mono: true },
          ]}
        />
      </Section>
      <Section label={t('usageReview.reconcile')}>
        <p className="o-row__meta">{t('usageReview.final')}</p>
        <form
          className="o-stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (body !== undefined) view.reconcile(body);
          }}
        >
          <div className="o-inline">
            <label htmlFor={ids.amount} className="o-field-label">
              {t('usageReview.verified')}
            </label>
            <input
              id={ids.amount}
              className="o-input"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
              }}
            />
          </div>
          <div className="o-inline">
            <label htmlFor={ids.source} className="o-field-label">
              {t('usageReview.source')}
            </label>
            <select
              id={ids.source}
              className="o-input o-select"
              value={source}
              onChange={(event) => {
                setSource(event.target.value);
              }}
            >
              <option value="">{t('usageReview.chooseSource')}</option>
              {EVIDENCE_SOURCES.map((option) => (
                <option key={option} value={option}>
                  {t(`usageReview.sources.${option}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="o-inline">
            <label htmlFor={ids.reference} className="o-field-label">
              {t('usageReview.reference')}
            </label>
            <input
              id={ids.reference}
              className="o-input"
              maxLength={MAX_EVIDENCE_LENGTH}
              autoComplete="off"
              value={reference}
              onChange={(event) => {
                setReference(event.target.value);
              }}
            />
          </div>
          <div className="o-inline">
            <label htmlFor={ids.reason} className="o-field-label">
              {t('usageReview.reason')}
            </label>
            <input
              id={ids.reason}
              className="o-input"
              maxLength={MAX_EVIDENCE_LENGTH}
              autoComplete="off"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
          </div>
          {view.reconcileFailure === undefined ? null : (
            <Banner tone="danger" tag={t('usageReview.errorTag')} live>
              <FailureText failure={view.reconcileFailure} />
            </Banner>
          )}
          <div className="o-inline">
            <Button type="submit" disabled={view.reconciling || body === undefined}>
              {view.reconciling ? t('usageReview.reconciling') : t('usageReview.reconcileButton')}
            </Button>
          </div>
        </form>
      </Section>
    </>
  );
}

function Reconciled({ item }: { readonly item: UsageReconciliation }): ReactElement {
  const { t, i18n } = useTranslation();
  return (
    <Section label={t('usageReview.reconciled')}>
      <p className="o-row__meta">
        {t('usageReview.reconciledBy', {
          login: item.reconciledBy,
          when: formatAbsolute(item.reconciledAt, i18n.language),
        })}
      </p>
      <Facts
        facts={[
          { label: t('usageReview.request'), value: item.id, mono: true },
          { label: t('usageReview.memberFact'), value: item.member },
          {
            label: t('usageReview.charge'),
            value: t('usageReview.corrected', {
              from: formatMicros(item.previousMicros, i18n.language),
              to: formatMicros(item.micros, i18n.language),
            }),
          },
          { label: t('usageReview.heldAt'), value: formatAbsolute(item.heldAt, i18n.language) },
          {
            label: t('usageReview.providerRequestId'),
            value: item.providerRequestId ?? t('usageReview.notCaptured'),
            mono: true,
          },
          item.workflowId === undefined
            ? undefined
            : { label: t('usageReview.workflow'), value: item.workflowId, mono: true },
          item.launchId === undefined
            ? undefined
            : { label: t('usageReview.launch'), value: item.launchId, mono: true },
          {
            label: t('usageReview.evidence'),
            // An evidence source this console does not know yet reads as the server wrote it.
            value: `${isEvidenceSource(item.source) ? t(`usageReview.sources.${item.source}`) : item.source} · ${item.reference}`,
          },
          { label: t('usageReview.reason'), value: item.reason },
        ]}
      />
      <p className="o-row__meta">{t('usageReview.kept')}</p>
    </Section>
  );
}
