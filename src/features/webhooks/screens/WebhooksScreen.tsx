// SPDX-License-Identifier: Apache-2.0
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { managesMembers } from '@/shared/org/roles';
import { WithOrg } from '@/shared/org/WithOrg';
import { Banner } from '@/shared/ui/Banner';
import { FailureText } from '@/shared/ui/FailureText';
import { EmptyState, LoadState, Screen, Section } from '@/shared/ui/Screen';
import { NewSecret } from '../components/NewSecret';
import { WebhookForm } from '../components/WebhookForm';
import { WebhookHelp } from '../components/WebhookHelp';
import { WebhookRow } from '../components/WebhookRow';
import { WEBHOOK_EVENT_TYPES } from '../model';
import { useCreateWebhook, useWebhooks } from '../useWebhooks';
import '../webhooks.css';

/** The organization's outgoing webhooks: its events sent, signed and retried, to the owner's own services. */
export function WebhooksScreen(): ReactElement {
  const { t } = useTranslation();
  return (
    <WithOrg title={t('webhooks.title')}>
      {(_org, role) =>
        managesMembers(role) ? (
          <Webhooks />
        ) : (
          <Screen title={t('webhooks.title')}>
            <EmptyState title={t('webhooks.adminsOnlyTitle')}>{t('webhooks.adminsOnly')}</EmptyState>
          </Screen>
        )
      }
    </WithOrg>
  );
}

function Webhooks(): ReactElement {
  const { t } = useTranslation();
  const view = useWebhooks();
  const create = useCreateWebhook();
  return (
    <Screen title={t('webhooks.title')} lead={t('webhooks.lead')}>
      <WebhookHelp />
      {create.created === undefined ? null : (
        <div className="o-stack">
          <NewSecret secret={create.created.secret} onDone={create.dismiss} />
          <Link to="/webhooks/$webhookId" params={{ webhookId: create.created.webhook.id }}>
            {t('webhooks.created.open', { url: create.created.webhook.url })}
          </Link>
        </div>
      )}
      <LoadState data={view.webhooks} failure={view.failure}>
        {(webhooks) =>
          webhooks.length === 0 ? (
            <EmptyState title={t('webhooks.list.emptyTitle')}>{t('webhooks.list.empty')}</EmptyState>
          ) : (
            <section aria-labelledby="wh-list" className="o-stack">
              <h2 id="wh-list" className="o-label">
                {t('webhooks.list.title')}
              </h2>
              <ul className="o-card o-rows">
                {webhooks.map((webhook) => (
                  <li key={webhook.id}>
                    <WebhookRow webhook={webhook} />
                  </li>
                ))}
              </ul>
            </section>
          )
        }
      </LoadState>
      <Section label={t('webhooks.form.title')}>
        <WebhookForm
          initial={{ url: '', description: '', types: WEBHOOK_EVENT_TYPES }}
          submit={t('webhooks.form.add')}
          submitting={t('webhooks.form.adding')}
          pending={create.creating}
          locked={create.created !== undefined}
          onSubmit={(draft) => {
            create.create(draft, () => undefined);
          }}
        />
        {create.failure === undefined ? null : (
          <Banner tone="danger" tag={t('webhooks.form.errorTag')} live>
            <FailureText failure={create.failure} />
          </Banner>
        )}
      </Section>
    </Screen>
  );
}
