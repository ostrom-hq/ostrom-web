// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useEnumLabel } from '@/shared/i18n/enumLabel';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Badge } from '@/shared/ui/Badge';
import { hostedStateOf, hostedTone } from '../model';

/** The state of a hosted process as a badge, with the failure it last had, in words a person reads. */
export function HostedState({
  state,
  failure,
}: {
  readonly state: string;
  readonly failure?: string | undefined;
}): ReactElement {
  const { t } = useTranslation();
  const label = useEnumLabel();
  const known = hostedStateOf(state);
  return (
    <>
      <Badge tone={hostedTone(known)}>{t(`tools.hosted.state.${known}`)}</Badge>
      {failure === undefined ? null : (
        <span className="o-row__meta">
          {t('tools.hosted.failure', {
            failure: label('tools.hosted.failureCode', failure),
          })}
        </span>
      )}
    </>
  );
}
