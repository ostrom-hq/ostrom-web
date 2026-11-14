// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Badge, type BadgeTone } from '@/shared/ui/Badge';
import type { SessionState } from '../model';

const TONES: Readonly<Record<SessionState, BadgeTone>> = {
  live: 'success',
  quiet: 'warning',
  ended: 'neutral',
};

export function StateBadge({ state }: { readonly state: SessionState }): ReactElement {
  const { t } = useTranslation();
  return <Badge tone={TONES[state]}>{t(`sessions.state.${state}`)}</Badge>;
}
