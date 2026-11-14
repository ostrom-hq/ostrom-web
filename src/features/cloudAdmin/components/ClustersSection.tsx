// SPDX-License-Identifier: Apache-2.0
import type { CloudCluster } from '@gen/api/types.gen';
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { LoadState, Section } from '@/shared/ui/Screen';
import {
  type ClusterDraft,
  clusterDraftOf,
  clusterProblem,
  clusterRequestOf,
  EMPTY_CLUSTER,
  needsCredentials,
} from '../model';
import { type CloudClustersViewModel, useCloudClusters } from '../useCloudAdmin';
import { Field } from './Field';
import { SaveOutcome } from './SaveOutcome';

/** The Kubernetes clusters sessions run on. Only mounted for an administrator of the instance. */
export function ClustersSection(): ReactElement {
  const { t } = useTranslation();
  const view = useCloudClusters();
  // `undefined`: no form; `'new'`: a new cluster; an id: that cluster is edited.
  const [editing, setEditing] = useState<string | undefined>(undefined);
  return (
    <Section label={t('cloudAdmin.clusters.title')}>
      <LoadState data={view.clusters} failure={view.failure} rows={2}>
        {(clusters) => (
          <div className="o-stack">
            {clusters.length === 0 ? <p className="o-empty">{t('cloudAdmin.clusters.empty')}</p> : null}
            <ul className="o-rows">
              {clusters.map((cluster) => (
                <li key={cluster.id}>
                  <div className="o-row">
                    <span className="o-row__main">
                      <span className="o-row__title">{cluster.name}</span>
                      <span className="o-row__meta">{cluster.apiUrl}</span>
                      <span className="o-row__meta">{cluster.allowedNamespaces.join(', ')}</span>
                    </span>
                    <span className="o-row__end o-inline">
                      <Badge tone={cluster.caCertificate.configured ? 'success' : 'warning'}>
                        {t(
                          cluster.caCertificate.configured
                            ? 'cloudAdmin.clusters.caSet'
                            : 'cloudAdmin.clusters.caNotSet',
                        )}
                      </Badge>
                      <Badge tone={cluster.serviceAccountToken.configured ? 'success' : 'warning'}>
                        {t(
                          cluster.serviceAccountToken.configured
                            ? 'cloudAdmin.clusters.tokenSet'
                            : 'cloudAdmin.clusters.tokenNotSet',
                        )}
                      </Badge>
                      <Button
                        variant="ghost"
                        aria-label={t('cloudAdmin.clusters.edit', { name: cluster.name })}
                        onClick={() => {
                          view.write.clear();
                          setEditing(cluster.id);
                        }}
                      >
                        {t('cloudAdmin.edit')}
                      </Button>
                    </span>
                  </div>
                  {editing === cluster.id ? (
                    <ClusterForm
                      key={`${cluster.id}-${String(cluster.version)}`}
                      stored={cluster}
                      view={view}
                      onDone={() => {
                        setEditing(undefined);
                      }}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
            {editing === 'new' ? (
              <ClusterForm
                stored={undefined}
                view={view}
                onDone={() => {
                  setEditing(undefined);
                }}
              />
            ) : (
              <div className="o-inline">
                <Button
                  onClick={() => {
                    view.write.clear();
                    setEditing('new');
                  }}
                >
                  {t('cloudAdmin.clusters.add')}
                </Button>
              </div>
            )}
          </div>
        )}
      </LoadState>
    </Section>
  );
}

function ClusterForm({
  stored,
  view,
  onDone,
}: {
  readonly stored: CloudCluster | undefined;
  readonly view: CloudClustersViewModel;
  readonly onDone: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ClusterDraft>(() =>
    stored === undefined ? EMPTY_CLUSTER : clusterDraftOf(stored),
  );
  const { write } = view;
  const problem = clusterProblem(draft, stored);
  const credentials = needsCredentials(draft, stored);
  const edit = (change: Partial<ClusterDraft>): void => {
    write.clear();
    setDraft({ ...draft, ...change });
  };
  return (
    <form
      className="o-card o-stack"
      aria-label={stored === undefined ? t('cloudAdmin.clusters.add') : stored.name}
      onSubmit={(event) => {
        event.preventDefault();
        if (problem === undefined) view.save(clusterRequestOf(draft, stored), stored?.id, onDone);
      }}
    >
      <Field
        label={t('cloudAdmin.clusters.name')}
        value={draft.name}
        disabled={write.saving}
        maxLength={100}
        onChange={(name) => {
          edit({ name });
        }}
      />
      <Field
        label={t('cloudAdmin.clusters.apiUrl')}
        type="url"
        value={draft.apiUrl}
        disabled={write.saving}
        maxLength={512}
        hint={t('cloudAdmin.clusters.apiUrlHint')}
        onChange={(apiUrl) => {
          edit({ apiUrl });
        }}
      />
      <Field
        label={t('cloudAdmin.clusters.allowedNamespaces')}
        value={draft.allowedNamespaces}
        disabled={write.saving}
        hint={t('cloudAdmin.clusters.allowedNamespacesHint')}
        onChange={(allowedNamespaces) => {
          edit({ allowedNamespaces });
        }}
      />
      <Field
        label={t('cloudAdmin.clusters.maxRunningPods')}
        type="number"
        value={draft.maxRunningPods}
        disabled={write.saving}
        onChange={(maxRunningPods) => {
          edit({ maxRunningPods });
        }}
      />
      <Field
        label={t('cloudAdmin.clusters.defaultStorageClass')}
        value={draft.defaultStorageClass}
        disabled={write.saving}
        maxLength={253}
        onChange={(defaultStorageClass) => {
          edit({ defaultStorageClass });
        }}
      />
      <Field
        label={t('cloudAdmin.clusters.caCertificate')}
        rows={4}
        value={draft.caCertificate}
        disabled={write.saving}
        maxLength={65536}
        hint={t(
          credentials ? 'cloudAdmin.clusters.credentialsNeeded' : 'cloudAdmin.clusters.credentialsKept',
        )}
        onChange={(caCertificate) => {
          edit({ caCertificate });
        }}
      />
      <Field
        label={t('cloudAdmin.clusters.serviceAccountToken')}
        type="password"
        value={draft.serviceAccountToken}
        disabled={write.saving}
        maxLength={16384}
        onChange={(serviceAccountToken) => {
          edit({ serviceAccountToken });
        }}
      />
      {problem === undefined ? null : (
        <p className="o-row__meta" role="status">
          {t('cloudAdmin.invalidField', { field: problem })}
        </p>
      )}
      <div className="o-inline">
        <Button type="submit" disabled={write.saving || problem !== undefined}>
          {write.saving ? t('cloudAdmin.saving') : t('cloudAdmin.save')}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t('cloudAdmin.cancel')}
        </Button>
      </div>
      <SaveOutcome
        write={write}
        saved={t('cloudAdmin.clusters.saved')}
        onReload={() => {
          void view.reload();
        }}
      />
    </form>
  );
}
