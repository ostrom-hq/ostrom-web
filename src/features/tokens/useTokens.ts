// SPDX-License-Identifier: Apache-2.0
import {
  createTokenMutation,
  listTokensOptions,
  listTokensQueryKey,
  revokeTokenMutation,
  rotateTokenMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { CreatedToken, Token } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import type { TokenLifetime } from './model';

export interface TokensViewModel {
  /** The live tokens, newest first, as the server lists them; never a secret. */
  readonly tokens: readonly Token[] | undefined;
  readonly failure: Error | undefined;
}

export function useTokens(): TokensViewModel {
  const query = useQuery(ready(listTokensOptions()));
  return { tokens: query.data?.tokens, failure: failureOf(query.error) };
}

function useInvalidate(): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: listTokensQueryKey() });
  }, [queryClient]);
}

/**
 * A secret is shown once, from the answer that carries it: it lives in this mutation only, dropped as soon as the
 * screen that shows it goes away (`gcTime: 0`), never in the query cache nor in web storage.
 */
const FORGET_AT_ONCE = { gcTime: 0 } as const;

export interface CreateTokenViewModel {
  /** Creates the token; `onCreated` runs once the server issued it (the form clears then, not before). */
  readonly create: (
    name: string,
    scopes: readonly string[],
    days: TokenLifetime,
    onCreated: () => void,
  ) => void;
  readonly creating: boolean;
  readonly created: CreatedToken | undefined;
  readonly failure: Error | undefined;
  /** Hides the secret: the person copied it. */
  readonly dismiss: () => void;
}

export function useCreateToken(): CreateTokenViewModel {
  const invalidate = useInvalidate();
  // The secret shows as soon as the server sent it; the list is read again behind it.
  const mutation = useMutation({
    ...createTokenMutation(),
    ...FORGET_AT_ONCE,
    onSuccess: () => {
      void invalidate();
    },
  });
  const { mutate, reset } = mutation;
  const create = useCallback(
    (name: string, scopes: readonly string[], days: TokenLifetime, onCreated: () => void) => {
      const body = { name: name.trim(), scopes: [...scopes] };
      mutate(days === null ? { body } : { body: { ...body, expiresInDays: days } }, { onSuccess: onCreated });
    },
    [mutate],
  );
  return {
    create,
    creating: mutation.isPending,
    created: mutation.data,
    failure: failureOf(mutation.error),
    dismiss: reset,
  };
}

export interface TokenActionsViewModel {
  readonly revoke: (id: string) => void;
  /** Replaces the secret: the old one stops working at once, the new one is shown once. */
  readonly rotate: (id: string) => void;
  /** The token being revoked or replaced. */
  readonly busy: string | undefined;
  /** The token a replacement just issued, with its new secret. */
  readonly rotated: CreatedToken | undefined;
  readonly failure: Error | undefined;
  readonly dismiss: () => void;
}

export function useTokenActions(): TokenActionsViewModel {
  const invalidate = useInvalidate();
  const revocation = useMutation({ ...revokeTokenMutation(), onSettled: invalidate });
  const rotation = useMutation({
    ...rotateTokenMutation(),
    ...FORGET_AT_ONCE,
    onSettled: () => {
      void invalidate();
    },
  });
  const { mutate: revokeMutate, reset: resetRevocation } = revocation;
  const { mutate: rotateMutate, reset: resetRotation } = rotation;
  // Only a failed replacement is cleared: a replaced secret, shown once, is never wiped from here.
  const rotationFailed = rotation.isError;
  const revoke = useCallback(
    (id: string) => {
      if (rotationFailed) resetRotation();
      revokeMutate({ path: { id } });
    },
    [revokeMutate, resetRotation, rotationFailed],
  );
  const rotate = useCallback(
    (id: string) => {
      resetRevocation();
      rotateMutate({ path: { id } });
    },
    [rotateMutate, resetRevocation],
  );
  let busy: string | undefined;
  if (revocation.isPending) busy = revocation.variables.path.id;
  else if (rotation.isPending) busy = rotation.variables.path.id;
  return {
    revoke,
    rotate,
    busy,
    rotated: rotation.data,
    failure: failureOf(revocation.error ?? rotation.error),
    dismiss: resetRotation,
  };
}
