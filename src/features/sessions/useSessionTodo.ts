// SPDX-License-Identifier: Apache-2.0
import { getSessionTodoOptions } from '@gen/api/@tanstack/react-query.gen';
import type { Todo } from '@gen/api/types.gen';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { ready } from '@/shared/api/ready';
import { useAnnounced } from '@/shared/capabilities';

/** No live feed carries a todo yet: the open view reads it again at this pace, only while the tab is visible. */
export const TODO_POLL_MS = 10_000;

export interface SessionTodoViewModel {
  /** The session's list; absent while it has none, while it loads, where the server does not serve todos, or on a failure. */
  readonly todo: Todo | undefined;
}

/**
 * The todo of a session, read on open and refreshed while the tab is visible and the session runs. Hidden entirely
 * (nothing, never an error) where the server does not announce `todos.v1`, or when it has no list for the session.
 */
export function useSessionTodo(sessionId: string, running: boolean): SessionTodoViewModel {
  const served = useAnnounced('todos.v1');
  const query = useQuery(
    ready(getSessionTodoOptions({ query: { sessionId } }), {
      enabled: served,
      retry: false,
      refetchInterval: () => (running ? TODO_POLL_MS : false),
    }),
  );
  // The session ended since the last read: its list may have changed in the meantime, read it once more.
  const wasRunning = useRef(running);
  const { refetch } = query;
  useEffect(() => {
    if (wasRunning.current && !running && served) void refetch();
    wasRunning.current = running;
  }, [running, served, refetch]);
  return { todo: served ? (query.data?.todo ?? undefined) : undefined };
}
