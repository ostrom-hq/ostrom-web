// SPDX-License-Identifier: Apache-2.0
import type { Rule } from '@gen/api/types.gen';
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEnumLabel } from '@/shared/i18n/enumLabel';
import { knownOr, type Known } from '@/shared/lib/openEnum';
import { safeHref } from '@/shared/lib/safeHref';
import { formatAbsolute } from '@/shared/lib/time';
import { Badge, type BadgeTone } from '@/shared/ui/Badge';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { editOf, isAccepted, phaseOf, percent, type RuleChange } from '../model';
import { RuleForm } from './RuleForm';

const STATUS_TONES: Readonly<Record<Known<Rule['status']>, BadgeTone>> = {
  proposed: 'neutral',
  accepted: 'success',
  edited: 'success',
  rejected: 'danger',
};

export interface RuleCardProps {
  readonly rule: Rule;
  /** Groups already in use, offered when the rule is edited. */
  readonly groups: readonly string[];
  /** Present when the viewer decides rules. */
  readonly onDecide: ((change: RuleChange, onSaved?: () => void) => void) | undefined;
  /** Deletes the rule; offered only with the decisions. */
  readonly onDelete: () => void;
  readonly saving: boolean;
  /** Why the last decision or edit of this rule was refused. */
  readonly failure: Error | undefined;
}

/** A rule with its evidence, then the decision: accept what is true, fix what is close, reject the rest. */
export function RuleCard({ rule, groups, onDecide, onDelete, saving, failure }: RuleCardProps): ReactElement {
  const { t, i18n } = useTranslation();
  const enumText = useEnumLabel();
  // The rule as it stood when its editor opened: a save sends what changed since then, never an older value.
  const [editing, setEditing] = useState<Rule | undefined>(undefined);
  // Decided elsewhere while the editor was open (accepted, rejected or reopened; a fix keeps it accepted): the editor
  // closes rather than decide it a second time.
  if (editing !== undefined && phaseOf(editing) !== phaseOf(rule)) setEditing(undefined);
  const accepted = isAccepted(rule);
  return (
    // Named by the statement itself, which the editor replaces on screen while it is open.
    <article className="o-card o-stack rl-card" aria-label={rule.statement}>
      <div className="o-inline">
        <Badge>{enumText('rules.strength', rule.strength)}</Badge>
        {rule.status === 'proposed' ? null : (
          <Badge tone={knownOr(STATUS_TONES, rule.status, 'neutral')}>
            {enumText('rules.status', rule.status)}
          </Badge>
        )}
        <span className="o-row__meta">{t('rules.card.confidence', { value: percent(rule.confidence) })}</span>
      </div>
      {editing !== undefined && onDecide !== undefined ? (
        <RuleForm
          rule={editing}
          groups={groups}
          saving={saving}
          submit={editing.status === 'proposed' ? t('rules.edit.save') : t('rules.form.save')}
          onCancel={() => {
            setEditing(undefined);
          }}
          onSave={(draft, actions) => {
            const change = editOf(editing, draft, actions);
            // Nothing changed on a decided rule: nothing to sign.
            if (change === undefined) setEditing(undefined);
            else
              onDecide(change, () => {
                setEditing(undefined);
              });
          }}
        />
      ) : (
        <p className="rl-statement">{rule.statement}</p>
      )}
      {rule.why === undefined || rule.why === '' ? null : (
        <p className="o-row__meta">{t('rules.card.why', { why: rule.why })}</p>
      )}
      {rule.scope === undefined || rule.scope.length === 0 ? null : (
        <p className="o-row__meta o-mono">{rule.scope.join(' · ')}</p>
      )}
      {rule.gate === undefined ? null : (
        <div className="o-stack rl-gate-read" aria-label={t('rules.form.gate.title')}>
          <p className="o-row__meta">
            {t('rules.card.gate', {
              actions: rule.gate.actions.map((action) => action.label).join(', '),
              approvers: rule.gate.approvers.join(', '),
            })}
          </p>
          {rule.gate.checks === undefined || rule.gate.checks.length === 0 ? null : (
            <p className="o-row__meta">
              {t('rules.card.checks', {
                checks: rule.gate.checks
                  .map((check) =>
                    check.attested === true ? t('rules.card.attested', { check: check.check }) : check.check,
                  )
                  .join(', '),
              })}
            </p>
          )}
        </div>
      )}
      {rule.sources === undefined || rule.sources.length === 0 ? null : (
        <ul className="rl-sources" aria-label={t('rules.card.sources')}>
          {rule.sources.map((source) => {
            const href = safeHref(source.url);
            return (
              <li key={`${source.kind}:${source.ref}`} className="o-mono">
                {href === undefined ? (
                  source.ref
                ) : (
                  <a href={href} target="_blank" rel="noreferrer noopener">
                    {source.ref}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {rule.decidedBy === undefined || rule.decidedAt === undefined ? null : (
        <p className="o-row__meta">
          {t(`rules.card.decided.${accepted ? 'accepted' : 'rejected'}`, {
            who: rule.decidedBy,
            when: formatAbsolute(rule.decidedAt, i18n.language),
          })}
        </p>
      )}
      {failure === undefined ? null : (
        <Banner tone="danger" tag={t('rules.errorTag')} live>
          {failure.message}
        </Banner>
      )}
      {onDecide === undefined || editing !== undefined ? null : (
        <div className="o-inline">
          {rule.status === 'proposed' ? (
            <>
              <Button
                disabled={saving}
                onClick={() => {
                  onDecide({ status: 'accepted' });
                }}
              >
                {t('rules.act.accept')}
              </Button>
              <Button
                disabled={saving}
                onClick={() => {
                  setEditing(rule);
                }}
              >
                {t('rules.act.edit')}
              </Button>
              <Button
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  onDecide({ status: 'rejected' });
                }}
              >
                {t('rules.act.reject')}
              </Button>
            </>
          ) : (
            <>
              <Button
                disabled={saving}
                onClick={() => {
                  setEditing(rule);
                }}
              >
                {t('rules.act.edit')}
              </Button>
              <Button
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  onDecide({ status: 'proposed' });
                }}
              >
                {t('rules.act.reopen')}
              </Button>
            </>
          )}
          <ConfirmButton
            label={t('rules.delete.label')}
            confirm={t('rules.delete.confirm')}
            keep={t('rules.delete.keep')}
            disabled={saving}
            onConfirm={onDelete}
          />
        </div>
      )}
    </article>
  );
}
