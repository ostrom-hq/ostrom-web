// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useNow } from '@/shared/lib/useNow';
import { Banner } from '@/shared/ui/Banner';
import { LoadState, Screen } from '@/shared/ui/Screen';
import { ArtifactCard } from '../components/ArtifactCard';
import { ownsArtifact } from '../model';
import { useArtifactChange, useArtifacts } from '../useSharing';
import './sharing.css';

/**
 * Pages and files the agents published, behind the sign-in: who reads each one, and its versions. Only the owner
 * changes, shares or deletes one; a role gives nobody those controls on someone else's artifact.
 */
export function ArtifactsScreen(): ReactElement {
  const { t } = useTranslation();
  const view = useArtifacts();
  const change = useArtifactChange();
  const now = useNow();
  return (
    <Screen title={t('sharing.artifacts.title')} lead={t('sharing.artifacts.lead')}>
      {change.failure === undefined ? null : (
        <Banner tone="danger" tag={t('sharing.errorTag')} live>
          {change.failure.message}
        </Banner>
      )}
      <LoadState data={view.artifacts} failure={view.failure}>
        {(artifacts) =>
          artifacts.length === 0 ? (
            <p className="o-empty">{t('sharing.artifacts.empty')}</p>
          ) : (
            <div className="o-stack">
              {artifacts.map((artifact) => (
                <ArtifactCard
                  key={artifact.id}
                  artifact={artifact}
                  now={now}
                  change={ownsArtifact(artifact, view.login) ? change : undefined}
                />
              ))}
            </div>
          )
        }
      </LoadState>
    </Screen>
  );
}
