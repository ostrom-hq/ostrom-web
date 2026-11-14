// SPDX-License-Identifier: Apache-2.0
import type { Webhook } from '@gen/api/types.gen';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useEnumLabel } from '@/shared/i18n/enumLabel';
import { managesMembers } from '@/shared/org/roles';
import { WithOrg } from '@/shared/org/WithOrg';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { FailureText } from '@/shared/ui/FailureText';
import { EmptyState, LoadState, Screen, Section } from '@/shared/ui/Screen';
import { DeliveriesTable } from '../components/DeliveriesTable';
import { StateLabel } from '../components/StateLabel';
import { WebhookActions } from '../components/WebhookActions';
import { WebhookForm } from '../components/WebhookForm';
import { WebhookHelp } from '../components/WebhookHelp';
import { DELIVERIES_SHOWN, isStaleVersion, utcTime } from '../model';
import {
  useDeliveries,
  useUpdateWebhook,
  useWebhook,
  useWebhookActions,
  type WebhookViewModel,
} from '../useWebhooks';
import '../webhooks.css';

function Back(): ReactElement {
  const { t } = useTranslation();
  return (
    <Link to="/webhooks" className="o-back">
      {t('webhooks.detail.back')}
    </Link>
  );
}

/** One webhook: its state, its settings, what can be done to it, and its latest deliveries. */
export function WebhookScreen(): ReactElement {
  const { t } = useTranslation();
  const { webhookId } = useParams({ from: '/webhooks/$webhookId' });
  return (
    <WithOrg title={t('webhooks.detail.title')}>
      {(_org, role) =>
        managesMembers(role) ? (
          <Detail id={webhookId} />
        ) : (
          <Screen top={<Back />} title={t('webhooks.detail.title')}>
            <EmptyState title={t('webhooks.adminsOnlyTitle')}>{t('webhooks.adminsOnly')}</EmptyState>
          </Screen>
        )
      }
    </WithOrg>
  );
}

function Detail({ id }: { readonly id: string }): ReactElement {
  const { t } = useTranslation();
  const view = useWebhook(id);
  if (view.notFound)
    return (
      <Screen top={<Back />} title={t('webhooks.detail.title')}>
        <EmptyState title={t('webhooks.detail.missingTitle')}>{t('webhooks.detail.missing')}</EmptyState>
      </Screen>
    );
  return (
    <LoadState data={view.webhook} failure={view.failure} rows={4}>
      {(webhook) => (
        <Screen
          top={<Back />}
          title={webhook.url}
          lead={webhook.description === '' ? undefined : webhook.description}
        >
          <WebhookDetail id={id} webhook={webhook} view={view} />
        </Screen>
      )}
    </LoadState>
  );
}

function WebhookDetail({
  id,
  webhook,
  view,
}: {
  readonly id: string;
  readonly webhook: Webhook;
  readonly view: WebhookViewModel;
}): ReactElement {
  const { t } = useTranslation();
  const label = useEnumLabel();
  const navigate = useNavigate();
  const update = useUpdateWebhook(id);
  const actions = useWebhookActions(id);
  const deliveries = useDeliveries(id);
  const stale = isStaleVersion(update.failure);
  return (
    <>
      <WebhookHelp />
      <Section label={t('webhooks.detail.state')}>
        <p className="o-inline">
          <StateLabel webhook={webhook} />
          <span>
            {t('webhooks.detail.failures', { count: webhook.consecutiveFailures })}
            {' · '}
            {t('webhooks.detail.created', { at: utcTime(webhook.createdAt) })}
          </span>
        </p>
        {webhook.enabled || webhook.disabledReason === undefined ? null : (
          <p className="o-row__meta">{label('webhooks.state.reasonAbout', webhook.disabledReason)}</p>
        )}
      </Section>
      <Section label={t('webhooks.settings.title')}>
        {/* Restarts from what the server holds whenever the webhook changed (a save, a reload). */}
        <WebhookForm
          key={webhook.version}
          initial={{ url: webhook.url, description: webhook.description, types: webhook.types }}
          enabled={webhook.enabled}
          submit={t('webhooks.settings.save')}
          submitting={t('webhooks.settings.saving')}
          pending={update.saving}
          onSubmit={(draft, enabled) => {
            update.save(webhook.version, draft, enabled);
          }}
        />
        {update.saved && update.failure === undefined ? (
          <p className="o-row__meta" role="status">
            {t('webhooks.settings.saved')}
          </p>
        ) : null}
        {update.failure === undefined ? null : (
          <Banner
            tone="danger"
            tag={t(stale ? 'webhooks.settings.staleTag' : 'webhooks.settings.errorTag')}
            live
          >
            {stale ? (
              <span className="o-stack">
                <span>{t('webhooks.settings.stale')}</span>
                <Button
                  onClick={() => {
                    update.reset();
                    view.reload();
                  }}
                >
                  {t('webhooks.settings.reload')}
                </Button>
              </span>
            ) : (
              <FailureText failure={update.failure} />
            )}
          </Banner>
        )}
      </Section>
      <WebhookActions
        actions={actions}
        onDeleted={() => {
          void navigate({ to: '/webhooks' });
        }}
      />
      <Section label={t('webhooks.deliveries.title')}>
        <p className="o-row__meta">
          <Button variant="ghost" disabled={deliveries.refreshing} onClick={deliveries.refresh}>
            {t('webhooks.deliveries.refresh')}
          </Button>{' '}
          {t('webhooks.deliveries.note', { count: DELIVERIES_SHOWN })}
        </p>
        <LoadState data={deliveries.deliveries} failure={deliveries.failure} rows={2}>
          {(items) =>
            items.length === 0 ? (
              <p className="o-row__meta">{t('webhooks.deliveries.empty')}</p>
            ) : (
              <DeliveriesTable deliveries={items} />
            )
          }
        </LoadState>
      </Section>
    </>
  );
}
