// SPDX-License-Identifier: AGPL-3.0-only
import type { Artifact } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatAbsolute } from '@/shared/lib/time';
import { Button } from '@/shared/ui/Button';
import type { ArtifactChangeViewModel } from '../useSharing';
import { useArtifactDetail } from '../useSharing';

export interface ArtifactDetailProps {
  readonly artifact: Artifact;
  /** Present when the viewer owns the artifact. */
  readonly change: ArtifactChangeViewModel | undefined;
}

/** Its versions, newest first, and who reads it: the readers are listed only when it is shared with people. */
export function ArtifactDetail({ artifact, change }: ArtifactDetailProps): ReactElement {
  const { t, i18n } = useTranslation();
  const detail = useArtifactDetail(artifact.id, change !== undefined);
  const [reader, setReader] = useState('');
  const readerId = useId();
  if (detail.failure !== undefined) return <p className="o-row__meta">{detail.failure.message}</p>;
  if (detail.versions === undefined || detail.readers === undefined)
    return <p className="o-row__meta">{t('sharing.artifacts.loading')}</p>;
  const readers = detail.readers;
  const candidates = (detail.members ?? []).filter(
    (member) => member.login !== artifact.owner && !readers.includes(member.login),
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
      {artifact.access === 'org' ? (
        <p className="o-row__meta">{t('sharing.artifacts.readersOrg')}</p>
      ) : artifact.access === 'personal' ? (
        <p className="o-row__meta">{t('sharing.artifacts.readersPersonal', { owner: artifact.owner })}</p>
      ) : (
        <>
          {readers.length === 0 ? (
            <p className="o-row__meta">{t('sharing.artifacts.readersNone')}</p>
          ) : (
            <ul className="o-rows">
              {readers.map((login) => (
                <li key={login} className="o-row">
                  <span className="o-row__main">
                    <span className="o-row__title">{login}</span>
                  </span>
                  {change === undefined || login === artifact.owner ? null : (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      aria-label={t('sharing.artifacts.unshareLabel', { login })}
                      onClick={() => {
                        change.unshare(artifact.id, login);
                      }}
                    >
                      {t('sharing.artifacts.unshare')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {change === undefined ? null : detail.membersFailure !== undefined ? (
            <p className="o-row__meta">{detail.membersFailure.message}</p>
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
                  <option key={member.login} value={member.login}>
                    {member.name === undefined ? member.login : `${member.name} (${member.login})`}
                  </option>
                ))}
              </select>
              <Button type="submit" disabled={busy || reader === ''}>
                {t('sharing.artifacts.share')}
              </Button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
