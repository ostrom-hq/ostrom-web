// SPDX-License-Identifier: AGPL-3.0-only
import type { AuditEvent } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { formatAbsolute } from '@/shared/lib/time';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { LoadState, Screen } from '@/shared/ui/Screen';
import { useAudit } from '../useAudit';

function AuditRow({ event }: { readonly event: AuditEvent }): ReactElement {
  const { i18n } = useTranslation();
  // The server words the facts, as strings: shown as it wrote them, in its order.
  const facts = Object.entries(event.meta ?? {}).map(([key, value]) => `${key}: ${value}`);
  return (
    <div className="o-row">
      <span className="o-row__main">
        <span className="o-row__title o-mono">{event.event}</span>
        <span className="o-row__meta">
          {[event.actor, event.subject, formatAbsolute(event.at, i18n.language)].join(' · ')}
        </span>
        {facts.length === 0 ? null : <span className="o-row__meta o-mono">{facts.join(' · ')}</span>}
      </span>
    </div>
  );
}

/** The organization's signed audit log, newest first: who changed what, for an owner or an admin. */
export function AuditScreen(): ReactElement {
  const { t } = useTranslation();
  const view = useAudit();
  return (
    <Screen title={t('audit.title')} lead={t('audit.lead')}>
      {view.forbidden ? (
        <Banner tone="info" tag={t('audit.forbiddenTag')}>
          {t('audit.forbidden')}
        </Banner>
      ) : null}
      {view.unavailable ? (
        <Banner tone="info" tag={t('audit.unavailableTag')}>
          {t('audit.unavailable')}
        </Banner>
      ) : null}
      {view.forbidden || view.unavailable ? null : (
        <>
          <LoadState data={view.events} failure={view.failure}>
            {(events) =>
              events.length === 0 ? (
                <p className="o-empty">{t('audit.empty')}</p>
              ) : (
                <ul className="o-card o-rows">
                  {events.map((event) => (
                    <li key={event.id}>
                      <AuditRow event={event} />
                    </li>
                  ))}
                </ul>
              )
            }
          </LoadState>
          {view.moreFailure === undefined ? null : (
            <Banner tone="warning" tag={t('app.failure.tag')} live>
              {view.moreFailure.message}
            </Banner>
          )}
          {view.more ? (
            <Button disabled={view.loadingMore} onClick={view.loadMore}>
              {view.loadingMore ? t('audit.loadingMore') : t('audit.more')}
            </Button>
          ) : null}
        </>
      )}
    </Screen>
  );
}
