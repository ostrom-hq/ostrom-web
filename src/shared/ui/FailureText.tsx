// SPDX-License-Identifier: AGPL-3.0-only
import { Link, useRouterState } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { stepUpOf } from '@/shared/api/stepUp';

export interface FailureTextProps {
  readonly failure: Error;
}

/**
 * What a refused write says. A sensitive one (a token, a role, a secret, an MCP server, a provider key) needs a
 * sign-in less than five minutes old, and the server answers 403 `step_up_required` otherwise (web audit 2, M3): the
 * person is asked to sign in again, then comes back here. Any other failure says what the server said.
 */
export function FailureText({ failure }: FailureTextProps): ReactElement {
  const { t } = useTranslation();
  const here = useRouterState({ select: (state) => `${state.location.pathname}${state.location.searchStr}` });
  if (!stepUpOf(failure)) return <>{failure.message}</>;
  return (
    <>
      {t('app.stepUp.body')}{' '}
      <Link to="/signin" search={{ redirect: here }}>
        {t('app.stepUp.signIn')}
      </Link>
    </>
  );
}
