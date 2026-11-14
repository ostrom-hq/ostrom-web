// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { formatMinor } from '@/shared/lib/money';
import { safeHref } from '@/shared/lib/safeHref';
import { formatAbsolute } from '@/shared/lib/time';
import { Badge } from '@/shared/ui/Badge';
import { LoadState, Section } from '@/shared/ui/Screen';
import { INVOICE_TONES, isInvoiceStatus } from '../model';
import { useInvoices } from '../useBilling';

/** Invoices and receipts, newest first, each opening Stripe's page or its PDF. */
export function Invoices({ orgId }: { readonly orgId: string }): ReactElement {
  const { t, i18n } = useTranslation();
  const { invoices, failure } = useInvoices(orgId);
  return (
    <Section label={t('billing.invoices.label')}>
      <LoadState data={invoices} failure={failure} rows={2}>
        {(items) =>
          items.length === 0 ? (
            <p className="o-empty">{t('billing.invoices.empty')}</p>
          ) : (
            <ul className="o-card o-rows">
              {items.map((invoice) => {
                const page = safeHref(invoice.hostedInvoiceUrl ?? undefined);
                const pdf = safeHref(invoice.pdfUrl ?? undefined);
                const total = formatMinor(invoice.total, invoice.currency, i18n.language);
                return (
                  <li key={invoice.id} className="o-row">
                    <span className="o-row__main">
                      <span className="o-row__title">{invoice.number ?? t('billing.invoices.noNumber')}</span>
                      <span className="o-row__meta">
                        {t('billing.invoices.line', {
                          date: formatAbsolute(invoice.created, i18n.language),
                          total,
                          tax: formatMinor(invoice.tax, invoice.currency, i18n.language),
                        })}
                      </span>
                    </span>
                    <span className="o-row__end o-inline">
                      <Badge
                        tone={isInvoiceStatus(invoice.status) ? INVOICE_TONES[invoice.status] : 'neutral'}
                      >
                        {isInvoiceStatus(invoice.status)
                          ? t(`billing.invoices.status.${invoice.status}`)
                          : invoice.status}
                      </Badge>
                      {page === undefined ? null : (
                        <a href={page} target="_blank" rel="noreferrer noopener">
                          {t('billing.invoices.view')}
                        </a>
                      )}
                      {pdf === undefined ? null : (
                        <a href={pdf} target="_blank" rel="noreferrer noopener">
                          {t('billing.invoices.pdf')}
                        </a>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )
        }
      </LoadState>
    </Section>
  );
}
