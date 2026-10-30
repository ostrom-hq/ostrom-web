// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { DIFF_FOLD_LINES, diffLineKind, diffLines } from '../model';

export interface DiffViewProps {
  readonly diff: string;
  /** Past DIFF_FOLD_LINES lines the diff is folded until the person opens it. */
  readonly expanded: boolean;
  readonly onExpand: () => void;
}

/** Wrapped, never scrolled sideways: a phone shows every character of what is approved. */
export function DiffView({ diff, expanded, onExpand }: DiffViewProps): ReactElement {
  const { t } = useTranslation();
  const lines = diffLines(diff);
  const folded = !expanded && lines.length > DIFF_FOLD_LINES;
  const shown = folded ? lines.slice(0, DIFF_FOLD_LINES) : lines;
  return (
    <div className="ys-diffwrap">
      <pre className="ys-diff">
        {shown.map((line, index) => (
          <span
            key={`${String(index)}:${line}`}
            className={`ys-diff__line ys-diff__line--${diffLineKind(line)}`}
          >
            {line.length > 0 ? line : ' '}
            {'\n'}
          </span>
        ))}
      </pre>
      {folded ? (
        <Button variant="secondary" onClick={onExpand}>
          {t('yes.detail.showFullDiff', { count: lines.length })}
        </Button>
      ) : null}
    </div>
  );
}
