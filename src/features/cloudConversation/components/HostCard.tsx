// SPDX-License-Identifier: Apache-2.0
import type { CloudSessionResponse } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { hostName, hostNotice, systemOf } from '@/features/cloudHost';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Badge } from '@/shared/ui/Badge';
import { Banner } from '@/shared/ui/Banner';
import { Section } from '@/shared/ui/Screen';

/**
 * Where a remote session runs (TeamCode's companion session details): its device, the device's system, the folder, whether
 * the device answers, and how the agent acts; then why it does not run, when its device is offline, has not started it
 * yet or refused it.
 */
export function HostCard({ session }: { readonly session: CloudSessionResponse }): ReactElement {
  const { t } = useTranslation();
  const host = session.host ?? undefined;
  const system = systemOf(host?.platform, host?.osVersion);
  const folder = host?.directoryName ?? undefined;
  const mode = host?.permissionMode;
  const notice = hostNotice(t, session);
  return (
    <>
      {notice === undefined ? null : (
        <Banner tone={notice.tone} tag={t('cloudConversation.host.detail.title')}>
          {notice.text}
        </Banner>
      )}
      <Section label={t('cloudConversation.host.detail.title')}>
        <dl className="cc-host">
          <dt>{t('cloudConversation.host.detail.runsOn')}</dt>
          <dd>
            {hostName(t, host)}{' '}
            <Badge tone={host?.online === true ? 'success' : 'warning'}>
              {host?.online === true
                ? t('cloudConversation.host.onlineChip')
                : t('cloudConversation.host.offlineChip')}
            </Badge>
          </dd>
          {system === undefined ? null : (
            <>
              <dt>{t('cloudConversation.host.detail.system')}</dt>
              <dd>{system}</dd>
            </>
          )}
          {folder === undefined ? null : (
            <>
              <dt>{t('cloudConversation.host.detail.folder')}</dt>
              <dd className="o-mono">{folder}</dd>
            </>
          )}
          {mode === 'ask' || mode === 'bypass' ? (
            <>
              <dt>{t('cloudConversation.host.detail.permissions')}</dt>
              <dd>{t(`cloudConversation.host.permissions.${mode}`)}</dd>
            </>
          ) : null}
        </dl>
      </Section>
    </>
  );
}
