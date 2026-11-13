// SPDX-License-Identifier: Apache-2.0
import {
  createServiceKeyMutation,
  deleteDeviceMutation,
  deleteServiceKeyMutation,
  listDevicesOptions,
  listDevicesQueryKey,
  listServiceKeysOptions,
  listServiceKeysQueryKey,
} from '@gen/api/@tanstack/react-query.gen';
import type { Device, ServiceKey } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { personalDevices, type ServiceKeyLifetime, sortDevices } from './model';

export interface DevicesViewModel {
  /** Where the CLI is signed in as the person, the most recently seen first. */
  readonly devices: readonly Device[] | undefined;
  readonly failure: Error | undefined;
  /** Signs a workstation out: its CLI token stops working at once. */
  readonly signOut: (device: Device) => void;
  /** A workstation is being signed out: no other sign-out starts meanwhile. */
  readonly signingOut: boolean;
  readonly signOutFailure: Error | undefined;
}

/**
 * The workstations. `personal` keeps the person's own (`ostrom login`), for their account: read in an organization,
 * the list also holds the elevated tokens bound to it, which stay on its settings.
 */
export function useDevices(personal = false): DevicesViewModel {
  const queryClient = useQueryClient();
  const query = useQuery(ready(listDevicesOptions(), { retry: false }));
  const devices = useMemo(() => {
    if (query.data === undefined) return undefined;
    return sortDevices(personal ? personalDevices(query.data.items) : query.data.items);
  }, [query.data, personal]);
  const relist = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: listDevicesQueryKey() });
  }, [queryClient]);
  // Pending until the list is read again, so a row never offers its sign-out twice.
  const deletion = useMutation({ ...deleteDeviceMutation(), onSettled: relist });
  const { mutate } = deletion;
  const signOut = useCallback(
    (device: Device) => {
      mutate({ path: { id: device.id } });
    },
    [mutate],
  );
  return {
    devices,
    failure: failureOf(query.error),
    signOut,
    signingOut: deletion.isPending,
    signOutFailure: failureOf(deletion.error),
  };
}

/** A secret is shown once, from the answer that carries it: kept in the mutation only, never in the cache. */
const FORGET_AT_ONCE = { gcTime: 0 } as const;

export interface ServiceKeysViewModel {
  /** The organization's live keys, newest first, without their secrets; undefined while loading. */
  readonly keys: readonly ServiceKey[] | undefined;
  readonly failure: Error | undefined;
  /** Creates a key; `onCreated` runs once the server issued it (the form clears then, not before). */
  readonly create: (
    name: string,
    scopes: readonly string[],
    days: ServiceKeyLifetime,
    onCreated: () => void,
  ) => void;
  readonly creating: boolean;
  /** The key just created, with its secret, until the person says they copied it. */
  readonly created: ServiceKey | undefined;
  readonly dismiss: () => void;
  readonly remove: (key: ServiceKey) => void;
  /** A key is being deleted. */
  readonly removing: boolean;
  /** Why the last creation or deletion failed; a stale sign-in reads as such (`FailureText`). */
  readonly changeFailure: Error | undefined;
}

/** The organization's service keys; asked only of an owner or an admin, the others are refused by the server. */
export function useServiceKeys(manages: boolean): ServiceKeysViewModel {
  const queryClient = useQueryClient();
  const query = useQuery(ready(listServiceKeysOptions(), { retry: false, enabled: manages }));
  const relist = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: listServiceKeysQueryKey() });
  }, [queryClient]);
  const creation = useMutation({
    ...createServiceKeyMutation(),
    ...FORGET_AT_ONCE,
    onSuccess: () => {
      void relist();
    },
  });
  const deletion = useMutation({ ...deleteServiceKeyMutation(), onSettled: relist });
  const { mutate: createMutate, reset: resetCreation } = creation;
  const { mutate: deleteMutate, reset: resetDeletion } = deletion;
  // Only a failed creation is cleared: a secret on screen, shown once, is never wiped from here.
  const creationFailed = creation.isError;
  const create = useCallback(
    (name: string, scopes: readonly string[], days: ServiceKeyLifetime, onCreated: () => void) => {
      resetDeletion();
      const body = { name: name.trim(), scopes: [...scopes] };
      createMutate(days === null ? { body } : { body: { ...body, expiresInDays: days } }, {
        onSuccess: onCreated,
      });
    },
    [createMutate, resetDeletion],
  );
  const remove = useCallback(
    (key: ServiceKey) => {
      if (creationFailed) resetCreation();
      deleteMutate({ path: { id: key.id } });
    },
    [deleteMutate, resetCreation, creationFailed],
  );
  return {
    keys: query.data?.items,
    failure: failureOf(query.error),
    create,
    creating: creation.isPending,
    created: creation.data,
    dismiss: resetCreation,
    remove,
    removing: deletion.isPending,
    changeFailure: failureOf(creation.error ?? deletion.error),
  };
}
