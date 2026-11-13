// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { Step } from '@/shared/lib/useStep';
import { Button } from './Button';

/** "Show 100 more (420 left)", under a list cut by `useStep`; nothing once every line is on screen. */
export function ShowMore({ step }: { readonly step: Step }): ReactElement | null {
  const { t } = useTranslation();
  if (step.hidden === 0) return null;
  return (
    <Button variant="ghost" onClick={step.showMore}>
      {t('app.showMore', { count: step.next, left: step.hidden })}
    </Button>
  );
}
