// SPDX-License-Identifier: Apache-2.0
import type { CloudSessionResponse } from '@gen/api/types.gen';
import { hostName, isRemote } from '@/features/cloudHost';
import type { TFunction } from '@/shared/i18n/instance';
import { deviceProblemOf } from './remote';

/** A refusal about the device or its folders in its own words, else as the server wrote it. */
export function deviceFailureText(t: TFunction, failure: Error): string {
  const problem = deviceProblemOf(failure);
  if (problem === undefined) return failure.message;
  return problem.kind === 'refusal'
    ? t(`cloud.remote.deviceRefusal.${problem.code}`)
    : t('cloud.remote.deviceRefusal.resume_folder', { code: problem.code });
}

/** Where the session runs: "Cloud", or "Remote · <device>" (TeamCode's companion `KindChips`). */
export function whereOf(t: TFunction, session: CloudSessionResponse): string {
  return isRemote(session)
    ? t('cloud.remote.kind.remote', { device: hostName(t, session.host) })
    : t('cloud.remote.kind.cloud');
}
