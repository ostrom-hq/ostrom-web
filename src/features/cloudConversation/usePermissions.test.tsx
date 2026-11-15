// SPDX-License-Identifier: Apache-2.0
import { getMeOptions } from '@gen/api/@tanstack/react-query.gen';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import type { ReactElement, ReactNode } from 'react';
import { ready } from '@/shared/api/ready';
import { setupMockApp } from '@/test/mockApp';
import { eventOf, type TranscriptEvent } from './events';
import { usePermissions } from './usePermissions';

const { server, traffic } = setupMockApp();

const AT = '2026-11-15T10:00:00.000Z';

/** Signed in, as the top bar makes it: the server's capabilities are read once `/auth/me` is. */
function SignedIn(): null {
  useQuery(ready(getMeOptions()));
  return null;
}

function wrapper({ children }: { readonly children: ReactNode }): ReactElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <SignedIn />
      {children}
    </QueryClientProvider>
  );
}

function event(seq: number, type: string, data: unknown): TranscriptEvent {
  return eventOf({ seq, type, at: AT, epoch: 1, data });
}

const tool = event(1, 'permission.request', { requestId: 'tool', toolName: 'Bash', input: {} });
const leftOut = event(1, 'permission.request', { requestId: 'big', toolName: 'Bash', inputTruncated: true });
const question = (questions: unknown[]): TranscriptEvent =>
  event(1, 'permission.request', { requestId: 'q', question: true, input: { questions } });
const red = { question: 'Red or blue?', options: [{ label: 'Red' }, { label: 'Blue' }] };

let answers = 0;
beforeEach(() => {
  answers = 0;
  traffic.onRequest((request) => {
    if (request.url.endsWith('/permissions')) answers += 1;
  });
});

function answered(): number {
  return answers;
}

async function mounted(
  events: readonly TranscriptEvent[],
  enableBypass: () => Promise<boolean> = async () => Promise.resolve(true),
): Promise<{ readonly result: { readonly current: ReturnType<typeof usePermissions> } }> {
  const rendered = renderHook(() => usePermissions('cs-33', undefined, events, enableBypass), { wrapper });
  await waitFor(() => {
    expect(rendered.result.current.card).toBeDefined();
  });
  return rendered;
}

describe('the permission actions refuse what the card does not offer (TeamCode SessionViewModel)', () => {
  it('sends nothing for a question that is not answered, not on its last step, or a tool use', async () => {
    const { result } = await mounted([question([red, { ...red, question: 'Again?' }])]);
    act(() => {
      result.current.sendAnswers();
    });
    const single = await mounted([question([red])]);
    act(() => {
      single.result.current.sendAnswers();
      single.result.current.allow();
      single.result.current.bypass();
      single.result.current.retry();
    });
    const toolUse = await mounted([tool]);
    act(() => {
      toolUse.result.current.sendAnswers();
    });
    const big = await mounted([leftOut]);
    act(() => {
      big.result.current.allow();
      big.result.current.bypass();
    });
    const bigQuestion = await mounted([
      event(1, 'permission.request', { requestId: 'bq', question: true, inputTruncated: true }),
    ]);
    act(() => {
      bigQuestion.result.current.sendAnswers();
    });
    expect(answered()).toBe(0);
  });

  it('holds every action while an answer is on its way, and has nothing to retry before a failure', async () => {
    server.use(
      http.post('*/api/v1/cloud/sessions/:id/permissions', async () => {
        await delay('infinite');
        return HttpResponse.json({}, { status: 202 });
      }),
    );
    const { result } = await mounted([question([red])]);
    act(() => {
      result.current.selectOption(0, 0);
    });
    act(() => {
      result.current.sendAnswers();
    });
    await waitFor(() => {
      expect(result.current.card?.draft.state).toBe('sending');
    });
    act(() => {
      result.current.selectOption(0, 1);
      result.current.sendAnswers();
      result.current.deny();
      result.current.retry();
    });
    expect(result.current.card?.draft.choices.get(0)?.options).toEqual([0]);
    expect(answered()).toBe(1);
    const toolUse = await mounted([tool]);
    act(() => {
      toolUse.result.current.allow();
    });
    await waitFor(() => {
      expect(toolUse.result.current.card?.editable).toBe(false);
    });
    act(() => {
      toolUse.result.current.allow();
      toolUse.result.current.bypass();
    });
    expect(answered()).toBe(2);
  });

  it('does nothing without a card', () => {
    const { result } = renderHook(
      () => usePermissions('cs-33', undefined, [], async () => Promise.resolve(true)),
      {
        wrapper,
      },
    );
    act(() => {
      result.current.next();
      result.current.previous();
      result.current.otherText(0, 'x');
      result.current.selectOther(0);
      result.current.deny();
      result.current.allow();
      result.current.retry();
    });
    expect(result.current.card).toBeUndefined();
    expect(answered()).toBe(0);
  });
});
