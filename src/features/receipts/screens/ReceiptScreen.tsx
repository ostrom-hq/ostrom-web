// SPDX-License-Identifier: Apache-2.0
import type { Receipt, Verification } from '@gen/api/types.gen';
import { Link, useParams } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { keyIdOf } from '@/shared/lib/signature';
import { formatAbsolute } from '@/shared/lib/time';
import { Badge } from '@/shared/ui/Badge';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { Facts, LoadState, Screen, Section } from '@/shared/ui/Screen';
import { Skeleton } from '@/shared/ui/Skeleton';
import { attestationOf, attestationTone } from '../model';
import { type ReceiptViewModel, useReceipt } from '../useReceipts';

export function ReceiptScreen(): ReactElement {
  const { t, i18n } = useTranslation();
  const { receiptId } = useParams({ from: '/receipts/$receiptId' });
  const view = useReceipt(receiptId);
  return (
    <LoadState data={view.receipt} failure={view.failure} rows={2}>
      {(receipt) => (
        <Screen
          top={
            <Link to="/receipts" className="o-back">
              {t('receipts.detail.back')}
            </Link>
          }
          title={t('receipts.detail.title', {
            kind: t(`receipts.kind.${receipt.subject.kind}`),
            id: receipt.subject.id,
          })}
          lead={t('receipts.detail.signed', { when: formatAbsolute(receipt.createdAt, i18n.language) })}
        >
          <ReceiptDetail receipt={receipt} view={view} />
        </Screen>
      )}
    </LoadState>
  );
}

interface ReceiptDetailProps {
  readonly receipt: Receipt;
  readonly view: ReceiptViewModel;
}

function ReceiptDetail({ receipt, view }: ReceiptDetailProps): ReactElement {
  const { t, i18n } = useTranslation();
  const money = new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'USD' });
  return (
    <>
      <Section label={t('receipts.detail.signature')}>
        <VerificationLine verification={view.verification} failure={view.verificationFailure} />
        <Facts
          facts={[
            { label: t('receipts.detail.receiptId'), value: receipt.id, mono: true },
            { label: t('receipts.detail.digest'), value: receipt.subject.digest, mono: true },
            {
              label: t('receipts.detail.key'),
              value: `ed25519 · ${keyIdOf(receipt.signature) ?? '?'}`,
              mono: true,
            },
          ]}
        />
      </Section>

      <Section label={t('receipts.detail.records')}>
        <Facts
          facts={[
            { label: t('receipts.detail.initiator'), value: receipt.initiator },
            receipt.agent === undefined
              ? undefined
              : { label: t('receipts.detail.agent'), value: receipt.agent },
            receipt.model === undefined
              ? undefined
              : { label: t('receipts.detail.model'), value: receipt.model },
            receipt.package === undefined
              ? undefined
              : {
                  label: t('receipts.detail.package'),
                  value: `${receipt.package.version} · ${receipt.package.digest}`,
                  mono: true,
                },
            receipt.costUsd === undefined
              ? undefined
              : { label: t('receipts.detail.cost'), value: money.format(receipt.costUsd) },
          ]}
        />
      </Section>

      {receipt.decisions.length === 0 ? null : (
        <Section label={t('receipts.detail.decisions')}>
          <ul className="o-rows">
            {receipt.decisions.map((decision) => (
              <li key={`${decision.approvalId}-${decision.at}`} className="o-row">
                <Badge tone={decision.result === 'approved' ? 'success' : 'danger'}>
                  {decision.result === 'approved'
                    ? t('receipts.detail.approved')
                    : t('receipts.detail.declined')}
                </Badge>
                <span className="o-row__main">
                  <Link
                    to="/yes/$approvalId"
                    params={{ approvalId: decision.approvalId }}
                    className="o-row__title"
                  >
                    {decision.approvalId}
                  </Link>
                  <span className="o-row__meta">
                    {t('receipts.detail.decidedBy', {
                      who: decision.by,
                      when: formatAbsolute(decision.at, i18n.language),
                    })}
                  </span>
                </span>
                {decision.selfApproved === true ? (
                  <Badge tone="warning">{t('receipts.detail.selfApproved')}</Badge>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {receipt.rules.length === 0 ? null : (
        <Section label={t('receipts.detail.rules')}>
          <Facts facts={receipt.rules.map((rule) => ({ label: rule.id, value: rule.digest, mono: true }))} />
        </Section>
      )}

      {receipt.nodes === undefined || receipt.nodes.length === 0 ? null : (
        <Section label={t('receipts.detail.steps')}>
          <ul className="o-rows">
            {receipt.nodes.map((node) => {
              const attestation = attestationOf(node);
              return (
                <li key={node.id} className="o-row">
                  <span className="o-row__main">
                    <span className="o-row__title">{node.label}</span>
                    {node.detail === undefined ? null : <span className="o-row__meta">{node.detail}</span>}
                  </span>
                  <span className="o-row__end o-inline">
                    {attestation === undefined ? null : (
                      <Badge tone={attestationTone(attestation)}>
                        {t(`receipts.attestation.${attestation}`)}
                      </Badge>
                    )}
                    {node.outcome}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section label={t('receipts.detail.yourself')}>
        <p className="o-screen__lead">{t('receipts.detail.yourselfHint')}</p>
        <pre className="o-cmd">{`ostrom verify ${receipt.id}`}</pre>
        <div>
          <Button disabled={view.downloading} onClick={view.download}>
            {view.downloading ? t('receipts.detail.downloading') : t('receipts.detail.download')}
          </Button>
        </div>
        {view.downloadFailure === undefined ? null : (
          <Banner tone="danger" tag={t('receipts.detail.downloadFailedTag')} live>
            {view.downloadFailure.message}
          </Banner>
        )}
      </Section>
    </>
  );
}

interface VerificationLineProps {
  readonly verification: Verification | undefined;
  readonly failure: Error | undefined;
}

/** What the server says of the signature, in one line: a person reads the badge, an auditor the key. */
function VerificationLine({ verification, failure }: VerificationLineProps): ReactElement {
  const { t } = useTranslation();
  if (failure !== undefined) return <p className="o-screen__lead">{failure.message}</p>;
  if (verification === undefined) return <Skeleton rows={1} />;
  return verification.ok ? (
    <p>
      <Badge tone="success">{t('receipts.detail.verified')}</Badge>{' '}
      {verification.kid === undefined ? null : t('receipts.detail.verifiedWith', { kid: verification.kid })}
    </p>
  ) : (
    <p role="alert">
      <Badge tone="danger">{t('receipts.detail.notVerified')}</Badge> {verification.reason}
    </p>
  );
}
