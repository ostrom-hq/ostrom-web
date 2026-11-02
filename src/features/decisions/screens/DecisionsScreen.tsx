// SPDX-License-Identifier: AGPL-3.0-only
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { formatAbsolute } from '@/shared/lib/time';
import { LoadState, Screen } from '@/shared/ui/Screen';
import { useDecisions } from '../useDecisions';

const ACTIONS = ['accepted', 'rejected', 'edited', 'proposed', 'deleted'] as const;
const KINDS = ['rule', 'workflow', 'owner', 'policy'] as const;

function known<T extends string>(list: readonly T[], value: string): value is T {
  return list.some((item) => item === value);
}

/** Every signed decision on a rule, a workflow, an owner or a policy, newest first, each with its receipt. */
export function DecisionsScreen(): ReactElement {
  const { t, i18n } = useTranslation();
  const { decisions: items, failure } = useDecisions();
  return (
    <Screen title={t('decisions.title')} lead={t('decisions.lead')}>
      <LoadState data={items} failure={failure}>
        {(decisions) =>
          decisions.length === 0 ? (
            <p className="o-empty">{t('decisions.empty')}</p>
          ) : (
            <ul className="o-card o-rows">
              {decisions.map((decision) => (
                <li key={decision.id}>
                  <Link
                    className="o-row"
                    to="/receipts/$receiptId"
                    params={{ receiptId: decision.receiptId }}
                  >
                    <span className="o-row__main">
                      <span className="o-row__title">
                        {t('decisions.line', {
                          who: decision.by,
                          // A word the console does not know yet is shown as the server wrote it.
                          action: known(ACTIONS, decision.action)
                            ? t(`decisions.action.${decision.action}`)
                            : decision.action,
                          kind: known(KINDS, decision.subject.kind)
                            ? t(`decisions.kind.${decision.subject.kind}`)
                            : decision.subject.kind,
                        })}
                      </span>
                      <span className="o-row__meta">
                        {[
                          decision.subject.label ?? decision.subject.id,
                          formatAbsolute(decision.at, i18n.language),
                        ].join(' · ')}
                      </span>
                    </span>
                    <span className="o-row__meta">{t('decisions.receipt')}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </LoadState>
    </Screen>
  );
}
