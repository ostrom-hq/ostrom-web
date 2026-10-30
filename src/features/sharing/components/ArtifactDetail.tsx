// SPDX-License-Identifier: AGPL-3.0-only
import type { Artifact } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useViewer } from '@/shared/auth/useViewer';
import { formatAbsolute } from '@/shared/lib/time';
import { Button } from '@/shared/ui/Button';
import type { ArtifactChangeViewModel } from '../useSharing';
import { isArtifactAccess } from '../model';
import { useArtifactDetail } from '../useSharing';

export interface ArtifactDetailProps {
  readonly artifact: Artifact;
  /** Present when the viewer owns the artifact. */
  readonly change: ArtifactChangeViewModel | undefined;
}

/** What the access says about who reads it, above the list of the members it is shared with. */
const ACCESS_NOTE = {
  personal: 'sharing.artifacts.readersPersonal',
  team: 'sharing.artifacts.readersTeam',
  link: 'sharing.artifacts.readersLink',
} as const;

/**
 * Its versions, newest first, and who reads it: what its access opens, then the members it is shared with (by id,
 * named from the organization's members when they could be read). Its owner adds and removes readers on any access.
 */
export function ArtifactDetail({ artifact, change }: ArtifactDetailProps): ReactElement {
  const { t, i18n } = useTranslation();
  const detail = useArtifactDetail(artifact.id);
  const viewer = useViewer();
  const [reader, setReader] = useState('');
  const readerId = useId();
  if (detail.failure !== undefined) return <p className="o-row__meta">{detail.failure.message}</p>;
  if (detail.versions === undefined || detail.readers === undefined || !detail.membersSettled)
    return <p className="o-row__meta">{t('sharing.artifacts.loading')}</p>;
  const readers = detail.readers;
  const members = detail.members;
  // Without the members, a reader is its id; with them, an id no member has is someone who left.
  const nameOf = (id: string): string =>
    members === undefined
      ? id
      : (members.find((member) => member.id === id)?.login ?? t('sharing.artifacts.formerMember'));
  // Never its owner, nor someone already reading it, nor an invitation not accepted yet (no account to share with).
  const candidates = (members ?? []).filter(
    (member) => member.login !== artifact.owner && member.role !== 'invited' && !readers.includes(member.id),
  );
  const busy = change?.pending === artifact.id;
  return (
    <div className="o-stack">
      <h4 className="sh-label">{t('sharing.artifacts.versions')}</h4>
      {detail.versions.length === 0 ? (
        <p className="o-row__meta">{t('sharing.artifacts.noVersion')}</p>
      ) : (
        <ol className="o-rows">
          {detail.versions.map((version) => (
            <li key={version.number} className="o-row">
              <span className="o-row__main">
                <span className="o-row__title">
                  {t('sharing.artifacts.versionLine', {
                    number: version.number,
                    who: version.createdBy,
                    when: formatAbsolute(version.createdAt, i18n.language),
                  })}
                </span>
                <span className="o-row__meta o-mono">{version.files.join(', ')}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <h4 className="sh-label">{t('sharing.artifacts.readers')}</h4>
      {isArtifactAccess(artifact.access) ? (
        <p className="o-row__meta">{t(ACCESS_NOTE[artifact.access], { owner: artifact.owner })}</p>
      ) : null}
      {readers.length === 0 ? (
        <p className="o-row__meta">{t('sharing.artifacts.readersNone')}</p>
      ) : (
        <ul className="o-rows">
          {readers.map((id) => {
            const login = nameOf(id);
            return (
              <li key={id} className="o-row">
                <span className="o-row__main">
                  <span className="o-row__title">{login}</span>
                </span>
                {change === undefined || id === viewer.memberId ? null : (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    aria-label={t('sharing.artifacts.unshareLabel', { login })}
                    onClick={() => {
                      change.unshare(artifact.id, id);
                    }}
                  >
                    {t('sharing.artifacts.unshare')}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {change === undefined ? null : members === undefined && detail.membersFailure !== undefined ? (
        <p className="o-row__meta">
          {t('sharing.artifacts.membersFailed', { reason: detail.membersFailure.message })}
        </p>
      ) : candidates.length === 0 ? null : (
        <form
          className="o-inline"
          onSubmit={(event) => {
            event.preventDefault();
            change.share(artifact.id, reader, () => {
              setReader('');
            });
          }}
        >
          <label htmlFor={readerId} className="o-field-label">
            {t('sharing.artifacts.addReader')}
          </label>
          <select
            id={readerId}
            className="o-input"
            value={reader}
            onChange={(event) => {
              setReader(event.target.value);
            }}
          >
            <option value="">{t('sharing.artifacts.pickReader')}</option>
            {candidates.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name === undefined ? member.login : `${member.name} (${member.login})`}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={busy || reader === ''}>
            {t('sharing.artifacts.share')}
          </Button>
        </form>
      )}
    </div>
  );
}
