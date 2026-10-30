// SPDX-License-Identifier: AGPL-3.0-only
import type { Rule, RuleStrength } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { safeHref } from '@/shared/lib/safeHref';
import { formatAbsolute } from '@/shared/lib/time';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { isAccepted, percent } from '../model';
import type { RuleChange } from '../useRules';

const STRENGTHS: readonly RuleStrength[] = ['required', 'recommended'];

function isStrength(value: string): value is RuleStrength {
  return STRENGTHS.some((strength) => strength === value);
}

export interface RuleCardProps {
  readonly rule: Rule;
  /** Present when the viewer decides rules. */
  readonly onDecide: ((change: RuleChange, onSaved?: () => void) => void) | undefined;
  readonly saving: boolean;
}

function RuleEditor({
  rule,
  saving,
  onSave,
  onCancel,
}: {
  readonly rule: Rule;
  readonly saving: boolean;
  readonly onSave: (change: RuleChange) => void;
  readonly onCancel: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const [statement, setStatement] = useState(rule.statement);
  const [strength, setStrength] = useState<RuleStrength>(rule.strength);
  const statementId = useId();
  const strengthId = useId();
  const trimmed = statement.trim();
  return (
    <form
      className="o-stack"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          ...(trimmed === rule.statement ? {} : { statement: trimmed }),
          ...(strength === rule.strength ? {} : { strength }),
        });
      }}
    >
      <label htmlFor={statementId} className="o-field-label">
        {t('rules.edit.statement')}
      </label>
      <textarea
        id={statementId}
        className="o-input"
        rows={3}
        value={statement}
        onChange={(event) => {
          setStatement(event.target.value);
        }}
      />
      <div className="o-inline">
        <label htmlFor={strengthId} className="o-field-label">
          {t('rules.edit.strength')}
        </label>
        <select
          id={strengthId}
          className="o-input o-select"
          value={strength}
          onChange={(event) => {
            if (isStrength(event.target.value)) setStrength(event.target.value);
          }}
        >
          {STRENGTHS.map((option) => (
            <option key={option} value={option}>
              {t(`rules.strength.${option}`)}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={saving || trimmed === ''}>
          {saving ? t('rules.edit.saving') : t('rules.edit.save')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t('rules.edit.cancel')}
        </Button>
      </div>
    </form>
  );
}

/** A rule with its evidence, then the decision: accept what is true, fix what is close, reject the rest. */
export function RuleCard({ rule, onDecide, saving }: RuleCardProps): ReactElement {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState(false);
  const accepted = isAccepted(rule);
  const headingId = useId();
  return (
    <article className="o-card o-stack rl-card" aria-labelledby={headingId}>
      <div className="o-inline">
        <Badge>{t(`rules.strength.${rule.strength}`)}</Badge>
        {rule.status === 'proposed' ? null : (
          <Badge tone={rule.status === 'rejected' ? 'danger' : 'success'}>
            {t(`rules.status.${rule.status}`)}
          </Badge>
        )}
        <span className="o-row__meta">{t('rules.card.confidence', { value: percent(rule.confidence) })}</span>
      </div>
      {editing && onDecide !== undefined ? (
        <RuleEditor
          rule={rule}
          saving={saving}
          onCancel={() => {
            setEditing(false);
          }}
          onSave={(change) => {
            onDecide(change, () => {
              setEditing(false);
            });
          }}
        />
      ) : (
        <p id={headingId} className="rl-statement">
          {rule.statement}
        </p>
      )}
      {rule.why === undefined ? null : (
        <p className="o-row__meta">{t('rules.card.why', { why: rule.why })}</p>
      )}
      {rule.scope === undefined || rule.scope.length === 0 ? null : (
        <p className="o-row__meta o-mono">{rule.scope.join(' · ')}</p>
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
      {onDecide === undefined || editing ? null : (
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
                  setEditing(true);
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
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => {
                onDecide({ status: 'proposed' });
              }}
            >
              {t('rules.act.reopen')}
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
