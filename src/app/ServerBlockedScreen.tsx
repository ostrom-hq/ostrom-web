// SPDX-License-Identifier: Apache-2.0
import { capabilitiesQueryKey, logoutMutation } from '@gen/api/@tanstack/react-query.gen';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { failureOf } from '@/shared/api/failureOf';
import { useAuthStore } from '@/shared/auth/authStore';
import { CONSOLE_API_VERSION, type ServerStatus } from '@/shared/capabilities';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { OstromMark } from '@/shared/ui/OstromMark';

export interface ServerBlockedScreenProps {
  readonly status: Extract<ServerStatus, { kind: 'unsupported' | 'too-old' }>;
}

/**
 * Replaces the console when the server cannot be spoken to: another API version, or one so old it has no
 * capabilities route. Nothing but the explanation, a new look at the server and the way to sign out.
 */
export function ServerBlockedScreen({ status }: ServerBlockedScreenProps): ReactElement {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const changed = useAuthStore((auth) => auth.changed);
  const signOut = useMutation({
    ...logoutMutation(),
    onSuccess: async () => {
      await navigate({ to: '/signin' });
      changed();
    },
  });
  const failure = failureOf(signOut.error);
  return (
    <div className="o-shell">
      <header className="o-topbar">
        <span className="o-brand">
          <OstromMark size={22} />
          <span>{t('app.name')}</span>
        </span>
      </header>
      <main id="main" className="o-main">
        <section className="o-page" aria-labelledby="server-blocked-title">
          <h1 id="server-blocked-title">
            {t(status.kind === 'unsupported' ? 'app.server.unsupportedTitle' : 'app.server.tooOldTitle')}
          </h1>
          <p className="o-lead">
            {status.kind === 'unsupported'
              ? t('app.server.unsupportedBody', { console: CONSOLE_API_VERSION, server: status.apiVersion })
              : t('app.server.tooOldBody', { console: CONSOLE_API_VERSION })}
          </p>
          {failure === undefined ? null : (
            <Banner tone="danger" tag={t('app.failure.tag')} live>
              {failure.message}
            </Banner>
          )}
          <p className="o-inline">
            <Button
              onClick={() => {
                void queryClient.invalidateQueries({ queryKey: capabilitiesQueryKey() });
              }}
            >
              {t('app.server.again')}
            </Button>
            <Button
              variant="ghost"
              disabled={signOut.isPending}
              onClick={() => {
                signOut.mutate({});
              }}
            >
              {t('app.server.signOut')}
            </Button>
          </p>
        </section>
      </main>
    </div>
  );
}
