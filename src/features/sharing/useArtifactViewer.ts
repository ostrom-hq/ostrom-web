// SPDX-License-Identifier: Apache-2.0
import {
  getArtifactOptions,
  getArtifactQueryKey,
  listArtifactsInfiniteQueryKey,
  listArtifactVersionsOptions,
  updateArtifactMutation,
} from '@gen/api/@tanstack/react-query.gen';
import { createArtifactTicket } from '@gen/api/sdk.gen';
import type { Artifact, ArtifactTicket, ArtifactVersion } from '@gen/api/types.gen';
import type { ArtifactAccess } from './model';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { newestFirst } from './useSharing';

/** TeamCode's viewer asks every 10 seconds, while the page is visible, whether a newer version is published. */
export const ARTIFACT_LIVE_MS = 10_000;

/** The artifact cannot be read any more: deleted, or access lost. A network blip or a 5xx is not. */
export function refused(error: unknown): boolean {
  return (
    isApiFailure(error) &&
    (error.kind === 'not-found' || error.kind === 'forbidden' || error.kind === 'unauthorized')
  );
}

/** Every 10 seconds, until the artifact cannot be read any more; a transient failure only skips a beat. */
export function livePoll(query: { readonly state: { readonly error: unknown } }): number | false {
  return refused(query.state.error) ? false : ARTIFACT_LIVE_MS;
}

export interface ArtifactViewerViewModel {
  readonly artifact: Artifact | undefined;
  /** The reading ticket of the version shown: its address on the content origin, for the frame. */
  readonly ticket: ArtifactTicket | undefined;
  readonly versions: readonly ArtifactVersion[] | undefined;
  /** The version the frame shows, once its ticket came back. */
  readonly shown: ArtifactVersion | undefined;
  /** A newer version is published than the one shown, which follows the latest (never for a pinned `?v=`). */
  readonly newer: boolean;
  /** Shows the latest version: a new ticket, so the frame reloads only when the reader asks. */
  readonly showLatest: () => void;
  /** Why the artifact cannot be read (not found, access lost). */
  readonly failure: Error | undefined;
  /** Why the page itself cannot be shown (artifacts off, no content origin, the ticket refused). */
  readonly ticketFailure: Error | undefined;
}

/**
 * One artifact for its reading page (TeamCode's `/artifact/<id>`): the artifact, its versions, and a sealed reading
 * ticket for the version asked (`requested`) or the latest. The ticket is asked once per version and reader action,
 * never again on its own: a page someone is using keeps its state. Following the latest, the artifact is read again
 * every 10 seconds while the page is visible (React Query pauses an interval in a hidden tab) to offer a newer one.
 */
export function useArtifactViewer(id: string, requested: number | undefined): ArtifactViewerViewModel {
  const [reloads, setReloads] = useState(0);
  const following = requested === undefined;
  // Polling stops at a refusal (deleted, access lost): the page says so once.
  const live = following ? { refetchInterval: livePoll } : {};
  const artifact = useQuery(ready(getArtifactOptions({ path: { id } }), live));
  // The versions follow too, so the newer one is listed when the reader asks for it.
  const versions = useQuery(ready(listArtifactVersionsOptions({ path: { id } }), { ...live, retry: false }));
  const ticket = useQuery({
    queryKey: ['artifactTicket', id, requested ?? 'latest', reloads],
    queryFn: async ({ signal }: { readonly signal: AbortSignal }) => {
      const body = requested === undefined ? {} : { version: requested };
      const { data } = await createArtifactTicket({ path: { id }, body, signal, throwOnError: true });
      return data;
    },
    // A ticket lasts hours: the frame keeps it until the reader asks for another version (TeamCode's viewer left
    // open past its ticket needs a reload too). The last one stays while the next loads: no blank frame between.
    staleTime: Infinity,
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[1] === id ? previous : undefined),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const sorted = useMemo(
    () => (versions.data === undefined ? undefined : newestFirst(versions.data.items)),
    [versions.data],
  );
  const number = ticket.data?.version;
  const shown = number === undefined ? undefined : sorted?.find((version) => version.number === number);
  const latest = artifact.data?.latestVersion;
  const showLatest = useCallback(() => {
    setReloads((count) => count + 1);
  }, []);
  return {
    artifact: artifact.data,
    ticket: ticket.data,
    versions: sorted,
    shown,
    newer: following && number !== undefined && latest !== undefined && latest > number,
    showLatest,
    // The versions only feed the panels: without them the page still reads.
    failure: artifact.data === undefined || refused(artifact.error) ? failureOf(artifact.error) : undefined,
    ticketFailure: failureOf(ticket.error),
  };
}

export interface ArtifactAccessViewModel {
  /** The owner changes who reads it; `onDone` runs once the server took it. */
  readonly save: (access: ArtifactAccess, onDone: () => void) => void;
  readonly pending: boolean;
  readonly failure: Error | undefined;
}

/** Changes an artifact's access (`updateArtifact`), then reads it and the list again. */
export function useArtifactAccess(id: string): ArtifactAccessViewModel {
  const queryClient = useQueryClient();
  const update = useMutation({
    ...updateArtifactMutation(),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getArtifactQueryKey({ path: { id } }) }),
        queryClient.invalidateQueries({ queryKey: listArtifactsInfiniteQueryKey() }),
      ]);
    },
  });
  const { mutateAsync } = update;
  const save = useCallback(
    (access: ArtifactAccess, onDone: () => void) => {
      // A refusal is shown through `failure`, not thrown here.
      mutateAsync({ path: { id }, body: { access } }).then(onDone, () => undefined);
    },
    [mutateAsync, id],
  );
  return { save, pending: update.isPending, failure: failureOf(update.error) };
}
