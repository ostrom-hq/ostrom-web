// SPDX-License-Identifier: Apache-2.0
import { act, renderHook } from '@testing-library/react';
import { STEP, useStep } from './useStep';

describe('useStep', () => {
  it('shows the first hundred lines, then a hundred more at a time', () => {
    const { result } = renderHook(() => useStep(250));
    expect(result.current).toMatchObject({ count: STEP, hidden: 150, next: STEP });
    act(() => {
      result.current.showMore();
    });
    expect(result.current).toMatchObject({ count: 200, hidden: 50, next: 50 });
    act(() => {
      result.current.showMore();
    });
    expect(result.current).toMatchObject({ hidden: 0, next: 0 });
  });

  it('starts again from the first lines when the list shows something else', () => {
    const { result, rerender } = renderHook(({ scope }) => useStep(30, scope, 10), {
      initialProps: { scope: 'todo' },
    });
    act(() => {
      result.current.showMore();
    });
    expect(result.current.count).toBe(20);
    rerender({ scope: 'all' });
    expect(result.current).toMatchObject({ count: 10, hidden: 20 });
  });
});
