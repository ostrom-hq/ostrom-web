// SPDX-License-Identifier: Apache-2.0
import { stopCloudTask } from '@gen/api/sdk.gen';
import type { CloudSession } from '@gen/api/types.gen';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { useAnnounced } from '@/shared/capabilities';
import type { KnownAgent, TranscriptEvent } from './events';
import { errorOf } from './pending';
import { backgroundCommands, liveTasks, type RunningWork, subagentsOf } from './subagents';

/** A short message under the panel. */
export type TaskNotice =
  { readonly kind: 'nothingRunning' } | { readonly kind: 'failure'; readonly error: Error };

export interface RunningWorkViewModel {
  /** The subagents (`runners.cloud.transcript.feeds.v1`) and background work (`runners.cloud.tasks.v1`) of the session. */
  readonly work: RunningWork;
  /** The clock the durations count to (epoch ms). */
  readonly now: number;
  /** The runner stops tasks, and the session runs. */
  readonly canStop: boolean;
  /** Tasks asked to stop that the runner still reports. */
  readonly stopping: ReadonlySet<string>;
  readonly notice: TaskNotice | undefined;
  readonly stop: (taskId: string) => void;
}

const EMPTY_WORK: RunningWork = { subagents: [], live: undefined, commands: [] };

/** The clock, every second while something runs (durations count up), every 30 s otherwise. */
function useTicking(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(
      () => {
        setNow(Date.now());
      },
      active ? 1_000 : 30_000,
    );
    return () => {
      clearInterval(timer);
    };
  }, [active]);
  return now;
}

/**
 * What runs in the session besides the conversation (TeamCode's companion subagent panel): its subagents, read from the
 * transcript and the server's list, and the background commands, monitors and wake-ups the runner reports, each command
 * stopped on a confirmed press.
 */
export function useRunningWork(
  sessionId: string,
  session: CloudSession | undefined,
  events: readonly TranscriptEvent[],
  agents: readonly KnownAgent[],
): RunningWorkViewModel {
  const feeds = useAnnounced('runners.cloud.transcript.feeds.v1');
  const tasks = useAnnounced('runners.cloud.tasks.v1');
  const [stopping, setStopping] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<TaskNotice | undefined>(undefined);
  /** The session's agent runs: only then has it background tasks. */
  const agentRuns = session?.status === 'running';
  const live = useMemo(() => (tasks ? liveTasks(events, agentRuns) : undefined), [tasks, events, agentRuns]);
  const active = (live?.tasks.length ?? 0) > 0;
  const now = useTicking(active);
  const work = useMemo((): RunningWork => {
    if (!feeds && !tasks) return EMPTY_WORK;
    return {
      subagents: feeds ? subagentsOf(events, agentRuns, live?.tasks, now, agents) : [],
      live,
      commands: live === undefined ? [] : backgroundCommands(live.tasks, events),
    };
  }, [feeds, tasks, events, agentRuns, live, now, agents]);

  const stop = useCallback(
    (taskId: string) => {
      setStopping((current) => new Set([...current, taskId]));
      setNotice(undefined);
      const release = (): void => {
        setStopping((current) => new Set([...current].filter((id) => id !== taskId)));
      };
      const run = async (): Promise<void> => {
        try {
          // Accepted: "Stopping…" until the runner's next report drops the task.
          await stopCloudTask({ path: { id: sessionId }, body: { taskId }, throwOnError: true });
        } catch (error) {
          release();
          setNotice(
            isApiFailure(error) && error.code === 'nothing_to_interrupt'
              ? { kind: 'nothingRunning' }
              : { kind: 'failure', error: errorOf(error) },
          );
        }
      };
      void run();
    },
    [sessionId],
  );

  return {
    work,
    now,
    canStop: tasks && live?.stoppable === true && agentRuns,
    // A task report drops the stops it no longer lists: they ended.
    stopping: new Set((live?.tasks ?? []).flatMap((task) => (stopping.has(task.id) ? [task.id] : []))),
    notice,
    stop,
  };
}
