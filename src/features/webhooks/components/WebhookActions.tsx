// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { FailureText } from '@/shared/ui/FailureText';
import { Section } from '@/shared/ui/Screen';
import type { WebhookActionsViewModel } from '../useWebhooks';
import { NewSecret } from './NewSecret';

export interface WebhookActionsProps {
  readonly actions: WebhookActionsViewModel;
  /** Runs once the webhook is deleted. */
  readonly onDeleted: () => void;
}

/** What a person does to a webhook that is not a setting: a test, a new secret, deleting it. */
export function WebhookActions({ actions, onDeleted }: WebhookActionsProps): ReactElement {
  const { t } = useTranslation();
  const locked = actions.busy || actions.rotated !== undefined;
  return (
    <Section label={t('webhooks.actions.title')}>
      <div className="o-inline">
        <Button disabled={locked} onClick={actions.test}>
          {t('webhooks.actions.test')}
        </Button>
        <ConfirmButton
          tone="secondary"
          label={t('webhooks.actions.rotate')}
          confirm={t('webhooks.actions.rotateConfirm')}
          keep={t('webhooks.actions.keep')}
          disabled={locked}
          onConfirm={actions.rotate}
        />
        <ConfirmButton
          label={t('webhooks.actions.delete')}
          confirm={t('webhooks.actions.deleteConfirm')}
          keep={t('webhooks.actions.keep')}
          disabled={locked}
          onConfirm={() => {
            actions.remove(onDeleted);
          }}
        />
      </div>
      {actions.tested ? (
        <p className="o-row__meta" role="status">
          {t('webhooks.actions.tested')}
        </p>
      ) : null}
      {actions.rotated === undefined ? null : (
        <NewSecret secret={actions.rotated.secret} onDone={actions.dismiss} />
      )}
      {actions.failure === undefined ? null : (
        <Banner tone="danger" tag={t('webhooks.actions.errorTag')} live>
          <FailureText failure={actions.failure} />
        </Banner>
      )}
    </Section>
  );
}
