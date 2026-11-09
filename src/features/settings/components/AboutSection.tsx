// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { consoleVersion, type ServerStatus } from '@/shared/capabilities';
import { Facts, Section } from '@/shared/ui/Screen';
import { Skeleton } from '@/shared/ui/Skeleton';

/** The versions in play: the server's, the API it speaks, and this console's own when the build knows it. */
export function AboutSection({ status }: { readonly status: ServerStatus }): ReactElement {
  const { t } = useTranslation();
  const own = consoleVersion();
  let body: ReactElement;
  if (status.kind === 'ready')
    body = (
      <Facts
        facts={[
          { label: t('settings.about.server'), value: status.capabilities.serverVersion, mono: true },
          { label: t('settings.about.api'), value: `v${String(status.capabilities.apiVersion)}`, mono: true },
          own === undefined ? undefined : { label: t('settings.about.console'), value: own, mono: true },
        ]}
      />
    );
  else if (status.kind === 'loading') body = <Skeleton rows={2} />;
  else body = <p className="o-row__meta">{t('settings.about.unknown')}</p>;
  return <Section label={t('settings.about.title')}>{body}</Section>;
}
