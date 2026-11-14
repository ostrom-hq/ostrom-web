// SPDX-License-Identifier: Apache-2.0
import type { CloudProfile } from '@gen/api/types.gen';
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { LoadState, Section } from '@/shared/ui/Screen';
import { EMPTY_PROFILE, type ProfileDraft, profileDraftOf, profileProblem, profileRequestOf } from '../model';
import { type CloudProfilesViewModel, useAssignableMembers, useCloudProfiles } from '../useCloudAdmin';
import { Field } from './Field';
import { InvalidHint } from './InvalidHint';
import { SaveOutcome } from './SaveOutcome';

/**
 * The organization's cloud profiles: where a session runs and with which image. Owners and admins write them, each
 * save publishing a new version; a member sees the ones assigned to them.
 */
export function ProfilesSection({ orgId }: { readonly orgId: string }): ReactElement {
  const { t } = useTranslation();
  const view = useCloudProfiles();
  const [editing, setEditing] = useState<string | undefined>(undefined);
  return (
    <Section label={t('cloudAdmin.profiles.title')}>
      <LoadState data={view.profiles} failure={view.failure} rows={2}>
        {(profiles) => (
          <div className="o-stack">
            {profiles.length === 0 ? (
              <p className="o-empty">
                {t(view.canEdit ? 'cloudAdmin.profiles.empty' : 'cloudAdmin.profiles.emptyMember')}
              </p>
            ) : null}
            <ul className="o-rows">
              {profiles.map((profile) => (
                <li key={profile.id}>
                  <div className="o-row">
                    <span className="o-row__main">
                      <span className="o-row__title">{profile.name}</span>
                      <span className="o-row__meta">
                        {t('cloudAdmin.profiles.runsIn', {
                          cluster: profile.clusterName ?? profile.spec.clusterId,
                          namespace: profile.spec.namespace,
                        })}
                      </span>
                      <span className="o-row__meta o-mono">{profile.spec.image}</span>
                    </span>
                    <span className="o-row__end o-inline">
                      <Badge>{t('cloudAdmin.profiles.version', { version: profile.version })}</Badge>
                      {view.canEdit ? (
                        <Button
                          variant="ghost"
                          aria-label={t('cloudAdmin.profiles.edit', { name: profile.name })}
                          onClick={() => {
                            view.write.clear();
                            setEditing(profile.id);
                          }}
                        >
                          {t('cloudAdmin.edit')}
                        </Button>
                      ) : null}
                    </span>
                  </div>
                  {editing === profile.id ? (
                    <ProfileForm
                      key={`${profile.id}-${String(profile.version)}`}
                      orgId={orgId}
                      stored={profile}
                      view={view}
                      onDone={() => {
                        setEditing(undefined);
                      }}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
            {!view.canEdit ? null : editing === 'new' ? (
              <ProfileForm
                orgId={orgId}
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
                  {t('cloudAdmin.profiles.add')}
                </Button>
              </div>
            )}
          </div>
        )}
      </LoadState>
    </Section>
  );
}

function ProfileForm({
  orgId,
  stored,
  view,
  onDone,
}: {
  readonly orgId: string;
  readonly stored: CloudProfile | undefined;
  readonly view: CloudProfilesViewModel;
  readonly onDone: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ProfileDraft>(() =>
    stored === undefined ? EMPTY_PROFILE : profileDraftOf(stored),
  );
  const people = useAssignableMembers(orgId);
  const { write } = view;
  const problem = profileProblem(draft);
  const [touched, setTouched] = useState(false);
  const edit = (change: Partial<ProfileDraft>): void => {
    write.clear();
    setTouched(true);
    setDraft({ ...draft, ...change });
  };
  const text = (name: keyof ProfileDraft, label: string, extra: { hint?: string; rows?: number } = {}) => (
    <Field
      label={label}
      value={String(draft[name])}
      disabled={write.saving}
      {...extra}
      onChange={(value) => {
        edit({ [name]: value });
      }}
    />
  );
  return (
    <form
      className="o-card o-stack"
      aria-label={stored === undefined ? t('cloudAdmin.profiles.add') : stored.name}
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (problem === undefined) view.save(profileRequestOf(draft, stored), stored?.id, onDone);
      }}
    >
      {text('name', t('cloudAdmin.profiles.name'))}
      {text('clusterId', t('cloudAdmin.profiles.clusterId'), {
        hint: t('cloudAdmin.profiles.clusterIdHint'),
      })}
      {text('namespace', t('cloudAdmin.profiles.namespace'))}
      {text('image', t('cloudAdmin.profiles.image'), { hint: t('cloudAdmin.profiles.imageHint') })}
      {text('allowedImageOverrides', t('cloudAdmin.profiles.allowedImageOverrides'), { rows: 2 })}
      {text('imagePullSecrets', t('cloudAdmin.profiles.imagePullSecrets'), { rows: 2 })}
      {text('cpuMillis', t('cloudAdmin.profiles.cpuMillis'))}
      {text('memoryMebibytes', t('cloudAdmin.profiles.memoryMebibytes'))}
      {text('workspaceSizeGibibytes', t('cloudAdmin.profiles.workspaceSizeGibibytes'))}
      {text('storageClass', t('cloudAdmin.profiles.storageClass'))}
      {text('agentKind', t('cloudAdmin.profiles.agentKind'))}
      {text('agentVersion', t('cloudAdmin.profiles.agentVersion'))}
      {text('idleTimeoutMinutes', t('cloudAdmin.profiles.idleTimeoutMinutes'))}
      <fieldset className="o-stack">
        <legend className="o-field-label">{t('cloudAdmin.profiles.assigned')}</legend>
        <p className="o-row__meta">{t('cloudAdmin.profiles.assignedHint')}</p>
        {people.map((person) => (
          <label key={person.id} className="o-inline">
            <input
              type="checkbox"
              checked={draft.assignedMemberIds.includes(person.id)}
              disabled={write.saving}
              onChange={(event) => {
                edit({
                  assignedMemberIds: event.target.checked
                    ? [...draft.assignedMemberIds, person.id]
                    : draft.assignedMemberIds.filter((id) => id !== person.id),
                });
              }}
            />
            {person.label}
          </label>
        ))}
      </fieldset>
      <InvalidHint
        label={problem === undefined ? undefined : t(`cloudAdmin.profiles.${problem}`)}
        shown={touched}
      />
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
        saved={t('cloudAdmin.profiles.saved')}
        onReload={() => {
          void view.reload();
        }}
      />
    </form>
  );
}
