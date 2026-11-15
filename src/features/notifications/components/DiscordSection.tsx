// SPDX-License-Identifier: Apache-2.0
import { useSearch } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useAnnounced } from '@/shared/capabilities';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Badge } from '@/shared/ui/Badge';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { FailureText } from '@/shared/ui/FailureText';
import { LoadState, Section } from '@/shared/ui/Screen';
import { type DiscordReturn, discordRefusalOf, discordReturnOf } from '../model';
import { useDiscordLink } from '../useNotifications';

/**
 * The member's Discord account (`discord.v1`): their notifications and the requests for their yes arrive there as
 * direct messages. The member signs in to Discord in this browser, which proves the account: nobody types a Discord
 * id, so nobody links another person's account. Discord's return comes back to this page with `?discord=`.
 */
export function DiscordSection(): ReactElement | null {
  const { t } = useTranslation();
  // Nothing is asked of a server that has not said it serves this.
  const served = useAnnounced('discord.v1');
  const view = useDiscordLink(served);
  const search: Record<string, unknown> = useSearch({ strict: false });
  const returned = discordReturnOf(search['discord']);
  if (!served) return null;
  return (
    <Section id="discord" label={t('discord.title')}>
      <p className="o-screen__lead">{t('discord.lead')}</p>
      {/* "Linked" only while the link says so: after an unlink, or a hand-typed address, it is not shown. */}
      {returned === undefined ||
      view.actionFailure !== undefined ||
      (returned === 'linked' && view.link?.linked !== true) ? null : (
        <Returned outcome={returned} />
      )}
      <LoadState data={view.link} failure={view.failure} rows={1}>
        {(link) =>
          link.linked ? (
            <>
              <p className="o-inline">
                <Badge tone="success">{t('discord.linkedTag')}</Badge>{' '}
                {link.discordUsername === undefined
                  ? t('discord.linkedUnnamed')
                  : t('discord.linked', { name: link.discordUsername })}
              </p>
              <span className="o-self-start">
                <Button onClick={view.disconnect} disabled={view.busy}>
                  {t('discord.unlink')}
                </Button>
              </span>
            </>
          ) : link.configured ? (
            <>
              <p>{t('discord.invite')}</p>
              <span className="o-self-start">
                <Button onClick={view.connect} disabled={view.busy}>
                  {view.busy ? t('discord.linking') : t('discord.link')}
                </Button>
              </span>
            </>
          ) : (
            <p className="o-empty">{t('discord.notConfigured')}</p>
          )
        }
      </LoadState>
      {view.unsafe ? (
        <Banner tone="danger" tag={t('discord.errorTag')} live>
          {t('discord.unsafe')}
        </Banner>
      ) : null}
      {view.actionFailure === undefined ? null : <Refused failure={view.actionFailure} />}
    </Section>
  );
}

/** What Discord's return said, once, above the link. */
function Returned({ outcome }: { readonly outcome: DiscordReturn }): ReactElement {
  const { t } = useTranslation();
  return outcome === 'linked' ? (
    <Banner tone="info" tag={t('discord.doneTag')} live>
      {t('discord.done')}
    </Banner>
  ) : (
    <Banner tone="danger" tag={t('discord.errorTag')} live>
      {t(`discord.refusal.${outcome}`)}
    </Banner>
  );
}

function Refused({ failure }: { readonly failure: Error }): ReactElement {
  const { t } = useTranslation();
  const refusal = discordRefusalOf(failure);
  return (
    <Banner tone="danger" tag={t('discord.errorTag')} live>
      {refusal === undefined ? <FailureText failure={failure} /> : t(`discord.refusal.${refusal}`)}
    </Banner>
  );
}
