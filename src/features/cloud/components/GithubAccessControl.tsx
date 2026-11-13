// SPDX-License-Identifier: AGPL-3.0-only
import type { CloudSession } from '@gen/api/types.gen';
import { type ReactElement, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { FailureText } from '@/shared/ui/FailureText';
import { accessOf, GITHUB_ACCESS, type GithubAccess } from '../model';

export interface GithubAccessControlProps {
  readonly session: CloudSession;
  /** Only the owner, signed in, changes it; everyone else reads it. */
  readonly mine: boolean;
  readonly busy: boolean;
  readonly failure: Error | undefined;
  readonly onChange: (access: GithubAccess) => void;
}

/** Whose GitHub the session's agent holds, and, for the owner, the choice of who may instruct it meanwhile. */
export function GithubAccessControl({
  session,
  mine,
  busy,
  failure,
  onChange,
}: GithubAccessControlProps): ReactElement {
  const { t } = useTranslation();
  const id = useId();
  const hintId = useId();
  const access = accessOf(session);
  return (
    <div className="o-stack cl-access">
      {mine ? (
        <>
          <label htmlFor={id} className="o-field-label">
            {t('cloud.github.label')}
          </label>
          <select
            id={id}
            className="o-input o-select"
            value={access}
            disabled={busy}
            aria-describedby={hintId}
            onChange={(event) => {
              const chosen = GITHUB_ACCESS.find((option) => option === event.target.value);
              if (chosen !== undefined && chosen !== access) onChange(chosen);
            }}
          >
            {GITHUB_ACCESS.map((option) => (
              <option key={option} value={option}>
                {t(`cloud.github.option.${option}`)}
              </option>
            ))}
          </select>
        </>
      ) : (
        <span className="o-field-label">
          {t('cloud.github.readOnly', { access: t(`cloud.github.option.${access}`) })}
        </span>
      )}
      <span id={hintId} className="o-row__meta">
        {t(`cloud.github.hint.${access}`)}
      </span>
      {failure === undefined ? null : (
        <span role="alert" className="cl-access__failure">
          {isApiFailure(failure) && failure.code === 'session_not_paused' ? (
            t('cloud.github.notPaused')
          ) : (
            <FailureText failure={failure} />
          )}
        </span>
      )}
    </div>
  );
}
