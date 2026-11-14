// SPDX-License-Identifier: Apache-2.0
import type { WorkflowEditors } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnnounced } from '@/shared/capabilities';
import { useOrgMembers } from '@/shared/org/members';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { LoadState, Section } from '@/shared/ui/Screen';
import {
  toggleMember,
  WORKFLOW_EDITOR_MODES,
  type WorkflowEditorMode,
  workflowEditorModeOf,
  workflowEditorsProblem,
} from '../model';
import { useWorkflowEditors } from '../useWorkflowEditors';

/**
 * Who decides workflows: every member, the admins (the default), or chosen members. An owner or an admin changes it;
 * everyone else reads it. A workflow with an approval step stays an owner's or an admin's decision whatever it says.
 */
export function WorkflowEditorsSection({
  orgId,
  manages,
}: {
  readonly orgId: string;
  readonly manages: boolean;
}): ReactElement | null {
  const { t } = useTranslation();
  // Nothing is asked of a server that has not said it serves this.
  const served = useAnnounced('workflows.settings.v1');
  const [saved, setSaved] = useState(false);
  const view = useWorkflowEditors(served);
  if (!served) return null;
  return (
    <Section label={t('settings.workflowEditors.title')}>
      <p className="o-row__meta">{t('settings.workflowEditors.lead')}</p>
      <LoadState data={view.editors} failure={view.failure} rows={1}>
        {(editors) =>
          manages ? (
            <EditorsForm
              key={JSON.stringify(editors)}
              orgId={orgId}
              editors={editors}
              view={view}
              saved={saved}
              onSaved={setSaved}
            />
          ) : (
            <ReadOnly editors={editors} orgId={orgId} />
          )
        }
      </LoadState>
    </Section>
  );
}

function modeWords(mode: WorkflowEditorMode): `settings.workflowEditors.mode.${WorkflowEditorMode}` {
  return `settings.workflowEditors.mode.${mode}`;
}

function ReadOnly({
  editors,
  orgId,
}: {
  readonly editors: WorkflowEditors;
  readonly orgId: string;
}): ReactElement {
  const { t } = useTranslation();
  const mode = workflowEditorModeOf(editors.mode);
  const people = useOrgMembers(orgId, { enabled: mode === 'members', retry: false });
  const names = (editors.memberIds ?? []).map(
    (id) => people.members?.find((member) => member.id === id)?.login ?? id,
  );
  return (
    <>
      <p>{t(modeWords(mode))}</p>
      {mode === 'members' && names.length > 0 ? <p className="o-row__meta">{names.join(', ')}</p> : null}
      <p className="o-row__meta">{t('settings.workflowEditors.readOnly')}</p>
    </>
  );
}

function EditorsForm({
  orgId,
  editors,
  view,
  saved,
  onSaved,
}: {
  readonly orgId: string;
  readonly editors: WorkflowEditors;
  readonly view: ReturnType<typeof useWorkflowEditors>;
  /** Kept above the form: what the server answers is read again, and the form starts over from it. */
  readonly saved: boolean;
  readonly onSaved: (saved: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [mode, setMode] = useState<WorkflowEditorMode>(workflowEditorModeOf(editors.mode));
  const [chosen, setChosen] = useState<readonly string[]>(editors.memberIds ?? []);
  const name = useId();
  const people = useOrgMembers(orgId, { enabled: mode === 'members', retry: false });
  const missing = workflowEditorsProblem(mode, chosen);
  return (
    <form
      className="o-stack"
      aria-label={t('settings.workflowEditors.title')}
      onSubmit={(event) => {
        event.preventDefault();
        onSaved(false);
        view.save({ mode, ...(mode === 'members' ? { memberIds: [...chosen] } : {}) }, () => {
          onSaved(true);
        });
      }}
    >
      <fieldset className="o-stack">
        <legend className="o-field-label">{t('settings.workflowEditors.title')}</legend>
        {WORKFLOW_EDITOR_MODES.map((candidate) => (
          <label key={candidate} className="o-inline">
            <input
              type="radio"
              name={name}
              checked={mode === candidate}
              onChange={() => {
                setMode(candidate);
                onSaved(false);
              }}
            />
            <span>{t(modeWords(candidate))}</span>
          </label>
        ))}
      </fieldset>
      {mode === 'members' ? (
        <fieldset className="o-stack">
          <legend className="o-field-label">{t('settings.workflowEditors.members')}</legend>
          {people.members === undefined ? (
            <p className="o-row__meta">{t('settings.workflowEditors.loadingMembers')}</p>
          ) : (
            <ul className="o-stack">
              {people.members.map((member) => (
                <li key={member.id}>
                  <label className="o-inline">
                    <input
                      type="checkbox"
                      checked={chosen.includes(member.id)}
                      onChange={() => {
                        setChosen(toggleMember(chosen, member.id));
                        onSaved(false);
                      }}
                    />
                    <span>{member.name === '' ? member.login : `${member.name} (${member.login})`}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {people.more === undefined ? null : (
            <span className="o-self-start">
              <Button variant="ghost" disabled={people.loadingMore} onClick={people.more}>
                {t('settings.workflowEditors.moreMembers')}
              </Button>
            </span>
          )}
          {missing ? <p className="o-row__meta">{t('settings.workflowEditors.noMember')}</p> : null}
        </fieldset>
      ) : null}
      <p className="o-row__meta">{t('settings.workflowEditors.gates')}</p>
      {view.saveFailure === undefined ? null : (
        <Banner tone="danger" tag={t('settings.workflowEditors.errorTag')} live>
          {view.saveFailure.message}
        </Banner>
      )}
      {saved ? (
        <Banner tag={t('settings.workflowEditors.savedTag')} live>
          {t('settings.workflowEditors.saved')}
        </Banner>
      ) : null}
      <div className="o-inline">
        <Button type="submit" disabled={view.saving || missing}>
          {view.saving ? t('settings.workflowEditors.saving') : t('settings.workflowEditors.save')}
        </Button>
      </div>
    </form>
  );
}
