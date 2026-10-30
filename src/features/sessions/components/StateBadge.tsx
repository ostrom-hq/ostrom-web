// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, type BadgeTone } from '@/shared/ui/Badge';
import type { SessionState } from '../model';

const TONES: Readonly<Record<SessionState, BadgeTone>> = { live: 'success', quiet: 'warning', ended: 'neutral' };

export function StateBadge({ state }: { readonly state: SessionState }): ReactElement {
  const { t } = useTranslation();
  return <Badge tone={TONES[state]}>{t(`sessions.state.${state}`)}</Badge>;
}
