// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { OrgRole } from '@/shared/org/roles';
import { managesMembers } from '@/shared/org/roles';
import { Badge, type BadgeTone } from '@/shared/ui/Badge';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { FailureText } from '@/shared/ui/FailureText';
import { Facts, LoadState } from '@/shared/ui/Screen';
import { type LinkState, readableDate } from '../model';
import { useMemberLinks, useOwnLink } from '../useGithubLinks';

const TONES: Record<LinkState, BadgeTone> = {
  linked: 'success',
  reconnect_required: 'warning',
  not_linked: 'neutral',
};

/** The person's own GitHub link, then, for an owner or an admin, every member's. Shown only where the server offers links. */
export function GithubLinks({
  org,
  role,
}: {
  readonly org: string;
  readonly role: OrgRole | undefined;
}): ReactElement {
  const own = useOwnLink(org);
  return (
    <>
      <OwnLink own={own} />
      {managesMembers(role) ? (
        <MemberLinks org={org} role={role} appConfigured={own.link?.appConfigured !== false} />
      ) : null}
    </>
  );
}

function OwnLink({ own }: { readonly own: ReturnType<typeof useOwnLink> }): ReactElement {
  const { t, i18n } = useTranslation();
  return (
    <section aria-labelledby="gh-link" className="o-card o-section o-stack">
      <h2 id="gh-link" className="o-label">
        {t('github.link.title')}
      </h2>
      <LoadState data={own.link} failure={own.failure} rows={2}>
        {(link) => {
          const date = link.linkedAt === undefined ? undefined : readableDate(link.linkedAt, i18n.language);
          return (
            <>
              <div className="o-gh__head">
                <Badge tone={TONES[link.state]}>{t(`github.link.state.${link.state}`)}</Badge>
              </div>
              <p className="o-gh__wrap">{t(`github.link.body.${link.state}`)}</p>
              {link.login === undefined ? null : (
                <Facts
                  facts={[
                    { label: t('github.link.account'), value: link.login, mono: true },
                    date === undefined ? undefined : { label: t('github.link.since'), value: date },
                  ]}
                />
              )}
              {own.unlinkFailure === undefined ? null : (
                <Banner tone="danger" tag={t('github.link.notDoneTag')} live>
                  <FailureText failure={own.unlinkFailure} />
                </Banner>
              )}
              <div className="o-gh__actions">
                {own.start !== undefined ? (
                  <a className="o-btn o-btn--secondary o-btn--md" href={own.start}>
                    {link.state === 'not_linked' ? t('github.link.link') : t('github.link.again')}
                  </a>
                ) : (
                  <span className="o-row__meta">{t('github.link.notConfigured')}</span>
                )}
                {link.state === 'not_linked' ? null : (
                  <ConfirmButton
                    label={t('github.link.unlink')}
                    confirm={t('github.link.unlinkConfirm')}
                    keep={t('github.link.keep')}
                    disabled={own.unlinking}
                    onConfirm={own.unlink}
                  />
                )}
              </div>
            </>
          );
        }}
      </LoadState>
    </section>
  );
}

function MemberLinks({
  org,
  role,
  appConfigured,
}: {
  readonly org: string;
  readonly role: OrgRole | undefined;
  readonly appConfigured: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const view = useMemberLinks(org, role, appConfigured);
  return (
    <section aria-labelledby="gh-links" className="o-card o-section o-stack">
      <h2 id="gh-links" className="o-label">
        {t('github.members.title')}
      </h2>
      <p className="o-row__meta o-gh__wrap">{t('github.members.lead')}</p>
      {view.unlinkFailure === undefined ? null : (
        <Banner tone="danger" tag={t('github.link.notDoneTag')} live>
          <FailureText failure={view.unlinkFailure} />
        </Banner>
      )}
      <LoadState data={view.rows} failure={view.failure} rows={3}>
        {(rows) => (
          <>
            <ul className="o-rows" aria-label={t('github.members.title')}>
              {rows.map((row) => (
                <li key={row.member.id} className="o-row">
                  <span className="o-row__main">
                    <span className="o-row__title">
                      {row.member.name === '' ? row.member.login : row.member.name}
                    </span>
                    <span className="o-row__meta">
                      {[row.member.login, row.login === undefined ? undefined : `@${row.login}`]
                        .filter((part) => part !== undefined)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="o-inline">
                    <Badge tone={TONES[row.state]}>{t(`github.link.state.${row.state}`)}</Badge>
                    {view.appConfigured ? (
                      <a
                        className="o-btn o-btn--secondary o-btn--md"
                        href={view.startFor(row.member.id)}
                        aria-label={t(
                          row.state === 'not_linked' ? 'github.members.linkFor' : 'github.members.relinkFor',
                          { login: row.member.login },
                        )}
                      >
                        {row.state === 'not_linked' ? t('github.members.link') : t('github.members.relink')}
                      </a>
                    ) : null}
                    {row.state === 'not_linked' ? null : (
                      <ConfirmButton
                        label={t('github.link.unlink')}
                        confirm={t('github.members.unlinkConfirm', { login: row.member.login })}
                        keep={t('github.link.keep')}
                        disabled={view.unlinking === row.member.id}
                        onConfirm={() => {
                          view.unlink(row.member.id);
                        }}
                      />
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {view.more === undefined ? null : <Button onClick={view.more}>{t('github.members.more')}</Button>}
            <p className="o-row__meta o-gh__wrap">{t('github.members.robotNote')}</p>
          </>
        )}
      </LoadState>
    </section>
  );
}
