// SPDX-License-Identifier: AGPL-3.0-only
import type { McpArgumentCondition, McpArgumentPolicy, McpAssignment, Member } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/shared/ui/Badge';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { LoadState } from '@/shared/ui/Screen';
import { ANY_TOOL, memberLabel } from '../model';
import { useServerAccess, useServerAccessChange } from '../useMcpAccess';
import { AssignForm } from './AssignForm';
import { PolicyForm } from './PolicyForm';

/** Who may use a server and which calls it refuses or holds, behind a button: nothing is read until it opens. */
export function ServerAccess({ server }: { readonly server: string }): ReactElement {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="o-stack">
      <div className="o-inline">
        <Button
          variant="ghost"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? t('tools.mcp.access.close') : t('tools.mcp.access.open')}
        </Button>
      </div>
      {open ? (
        <div id={panelId} className="o-stack tl-access">
          <AccessPanel server={server} />
        </div>
      ) : null}
    </div>
  );
}

function AccessPanel({ server }: { readonly server: string }): ReactElement {
  const { t } = useTranslation();
  const view = useServerAccess(server);
  const change = useServerAccessChange(server);
  const loaded =
    view.assignments === undefined || view.policies === undefined
      ? undefined
      : { assignments: view.assignments, policies: view.policies };
  return (
    <>
      {change.failure === undefined ? null : (
        <Banner tone="danger" tag={t('tools.errorTag')} live>
          {change.failure.message}
        </Banner>
      )}
      <LoadState data={loaded} failure={view.failure} rows={2}>
        {({ assignments, policies }) => (
          <>
            <h4 className="tl-label">{t('tools.mcp.access.who')}</h4>
            {assignments.length === 0 ? (
              <p className="o-screen__lead">{t('tools.mcp.access.nobody')}</p>
            ) : (
              <ul className="o-rows" aria-label={t('tools.mcp.access.whoList', { server })}>
                {assignments.map((assignment) => (
                  <AssignmentRow
                    key={assignment.member ?? 'all'}
                    assignment={assignment}
                    members={view.members}
                    busy={change.pending}
                    onRemove={() => {
                      change.unassign(assignment.member);
                    }}
                  />
                ))}
              </ul>
            )}
            <AssignForm server={server} members={view.members} change={change} />
            <h4 className="tl-label">{t('tools.mcp.access.policies')}</h4>
            {policies.length === 0 ? (
              <p className="o-screen__lead">{t('tools.mcp.access.noPolicy')}</p>
            ) : (
              <ul className="o-rows" aria-label={t('tools.mcp.access.policyList', { server })}>
                {policies.map((policy) => (
                  <PolicyRow
                    key={policy.id}
                    policy={policy}
                    busy={change.pending}
                    onRemove={() => {
                      change.removePolicy(policy.id);
                    }}
                  />
                ))}
              </ul>
            )}
            <PolicyForm server={server} change={change} />
          </>
        )}
      </LoadState>
    </>
  );
}

interface AssignmentRowProps {
  readonly assignment: McpAssignment;
  readonly members: readonly Member[] | undefined;
  readonly busy: boolean;
  readonly onRemove: () => void;
}

function AssignmentRow({ assignment, members, busy, onRemove }: AssignmentRowProps): ReactElement {
  const { t } = useTranslation();
  const id = assignment.member;
  const known = id === undefined ? undefined : members?.find((member) => member.id === id);
  // Without the members, a member is their id; with them, an id no member has is someone who left.
  const who =
    id === undefined
      ? t('tools.mcp.access.everyone')
      : known === undefined
        ? members === undefined
          ? id
          : t('tools.mcp.access.formerMember', { id })
        : memberLabel(known);
  const tools =
    assignment.tools === undefined
      ? t('tools.mcp.access.allTools')
      : assignment.tools.length === 0
        ? t('tools.mcp.access.noTool')
        : t('tools.mcp.tools', { list: assignment.tools.join(', ') });
  return (
    <li className="o-row">
      <span className="o-row__main">
        <span className={known === undefined && id !== undefined ? 'o-row__title o-mono' : 'o-row__title'}>
          {who}
        </span>
        <span className="o-row__meta">
          {[
            tools,
            assignment.credentialSecret === undefined
              ? undefined
              : t('tools.mcp.access.credential', { name: assignment.credentialSecret }),
          ]
            .filter((part) => part !== undefined)
            .join(' · ')}
        </span>
      </span>
      <span className="o-row__end">
        <ConfirmButton
          label={t('tools.mcp.access.takeBack')}
          confirm={t('tools.mcp.access.takeBackConfirm', { who })}
          keep={t('tools.remove.keep')}
          disabled={busy}
          onConfirm={onRemove}
        />
      </span>
    </li>
  );
}

function conditionText(condition: McpArgumentCondition, operator: string): string {
  return condition.value === undefined
    ? `${condition.path} ${operator}`
    : `${condition.path} ${operator} ${condition.value}`;
}

interface PolicyRowProps {
  readonly policy: McpArgumentPolicy;
  readonly busy: boolean;
  readonly onRemove: () => void;
}

function PolicyRow({ policy, busy, onRemove }: PolicyRowProps): ReactElement {
  const { t } = useTranslation();
  const tool = policy.tool === ANY_TOOL ? t('tools.mcp.access.anyTool') : policy.tool;
  const when =
    policy.conditions.length === 0
      ? t('tools.mcp.access.everyCall')
      : policy.conditions
          .map((condition) => conditionText(condition, t(`tools.mcp.access.operator.${condition.operator}`)))
          .join(t('tools.mcp.access.and'));
  return (
    <li className="o-row">
      <span className="o-row__main">
        <span className="o-inline">
          <span className="o-row__title o-mono">{tool}</span>
          {/* Amber holds, red refuses: garnet stays for the yes itself. */}
          <Badge tone={policy.effect === 'DENY' ? 'danger' : 'warning'}>
            {t(`tools.mcp.access.effect.${policy.effect}`)}
          </Badge>
        </span>
        <span className="o-row__meta o-mono">{when}</span>
        <span className="o-row__meta tl-says">{t('tools.mcp.access.says', { message: policy.message })}</span>
      </span>
      <span className="o-row__end">
        <ConfirmButton
          label={t('tools.remove.ask')}
          confirm={t('tools.mcp.access.removePolicy', { tool })}
          keep={t('tools.remove.keep')}
          disabled={busy}
          onConfirm={onRemove}
        />
      </span>
    </li>
  );
}
