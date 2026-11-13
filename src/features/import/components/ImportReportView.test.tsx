// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react';
import '@/shared/i18n/i18n';
import { ImportReportView } from './ImportReportView';

describe('ImportReportView', () => {
  it('shows a kind and an action a newer server names as text (CS-04)', () => {
    render(
      <ImportReportView
        mode="import"
        report={{
          created: 0,
          updated: 0,
          unchanged: 0,
          skipped: 0,
          reviveAtCutover: 0,
          items: [{ kind: 'novel_kind', name: 'thing', action: 'novel_action' }],
        }}
      />,
    );
    expect(screen.getByText('thing')).toBeInTheDocument();
    expect(screen.getByText('novel_kind')).toBeInTheDocument();
    expect(screen.getByText('novel_action')).toBeInTheDocument();
  });
});
