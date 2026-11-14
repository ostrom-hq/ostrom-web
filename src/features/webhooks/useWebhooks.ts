// SPDX-License-Identifier: Apache-2.0
import {
  createWebhookMutation,
  deleteWebhookMutation,
  getWebhookOptions,
  getWebhookQueryKey,
  listWebhookDeliveriesOptions,
  listWebhookDeliveriesQueryKey,
  listWebhooksOptions,
  listWebhooksQueryKey,
  rotateWebhookSecretMutation,
  testWebhookMutation,
  updateWebhookMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { CreatedWebhook, Webhook, WebhookDelivery } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { DELIVERIES_SHOWN } from './model';

/** What a form sends: the webhook's target, what it receives, and (on a change) whether it delivers. */
export interface WebhookDraft {
  readonly url: string;
  readonly description: string;
  readonly types: readonly string[];
}

export interface WebhooksViewModel {
  /** The organization's webhooks, oldest first, as the server lists them; never a secret. */
  readonly webhooks: readonly Webhook[] | undefined;
  readonly failure: Error | undefined;
}

export function useWebhooks(): WebhooksViewModel {
  const query = useQuery(ready(listWebhooksOptions()));
  return { webhooks: query.data?.items, failure: failureOf(query.error) };
}

/**
 * A secret is shown once, from the answer that carries it: it lives in this mutation only, dropped as soon as the
 * screen that shows it goes away (`gcTime: 0`), never in the query cache nor in web storage.
 */
const FORGET_AT_ONCE = { gcTime: 0 } as const;

function bodyOf(draft: WebhookDraft): { url: string; types: string[]; description: string } {
  return { url: draft.url.trim(), types: [...draft.types], description: draft.description.trim() };
}

export interface CreateWebhookViewModel {
  /** Adds the webhook; `onCreated` runs once the server created it (the form clears then, not before). */
  readonly create: (draft: WebhookDraft, onCreated: () => void) => void;
  readonly creating: boolean;
  readonly created: CreatedWebhook | undefined;
  readonly failure: Error | undefined;
  /** Hides the secret: the person copied it. */
  readonly dismiss: () => void;
}

export function useCreateWebhook(): CreateWebhookViewModel {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...createWebhookMutation(),
    ...FORGET_AT_ONCE,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: listWebhooksQueryKey() });
    },
  });
  const { mutate, reset } = mutation;
  const create = useCallback(
    (draft: WebhookDraft, onCreated: () => void) => {
      mutate({ body: bodyOf(draft) }, { onSuccess: onCreated });
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

export interface WebhookViewModel {
  readonly webhook: Webhook | undefined;
  readonly failure: Error | undefined;
  /** 404: no such webhook in this organization (or it was just deleted). */
  readonly notFound: boolean;
  /** Reads it again: the settings form restarts from what the server holds. */
  readonly reload: () => void;
}

export function useWebhook(id: string): WebhookViewModel {
  const query = useQuery(ready(getWebhookOptions({ path: { id } })));
  const failure = failureOf(query.error);
  const { refetch } = query;
  return {
    webhook: query.data,
    failure,
    notFound: isApiFailure(failure) && failure.kind === 'not-found',
    reload: () => {
      void refetch();
    },
  };
}

export interface DeliveriesViewModel {
  /** The latest deliveries, newest first. */
  readonly deliveries: readonly WebhookDelivery[] | undefined;
  readonly failure: Error | undefined;
  readonly refreshing: boolean;
  readonly refresh: () => void;
}

export function useDeliveries(id: string): DeliveriesViewModel {
  const query = useQuery(
    ready(listWebhookDeliveriesOptions({ path: { id }, query: { limit: DELIVERIES_SHOWN } })),
  );
  const { refetch } = query;
  return {
    deliveries: query.data?.items,
    failure: failureOf(query.error),
    refreshing: query.isFetching,
    refresh: () => {
      void refetch();
    },
  };
}

export interface UpdateWebhookViewModel {
  /** Saves the settings over `version`: the server refuses it (409 `stale_version`) when the webhook changed since. */
  readonly save: (version: number, draft: WebhookDraft, enabled: boolean) => void;
  readonly saving: boolean;
  /** The webhook as saved, until the form restarts from it. */
  readonly saved: boolean;
  readonly failure: Error | undefined;
  /** Forgets the last save and its refusal: the form restarts from the webhook as the server holds it. */
  readonly reset: () => void;
}

export function useUpdateWebhook(id: string): UpdateWebhookViewModel {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...updateWebhookMutation(),
    onSuccess: (webhook) => {
      queryClient.setQueryData(getWebhookQueryKey({ path: { id } }), webhook);
      void queryClient.invalidateQueries({ queryKey: listWebhooksQueryKey() });
    },
  });
  const { mutate, reset } = mutation;
  const save = useCallback(
    (version: number, draft: WebhookDraft, enabled: boolean) => {
      mutate({ path: { id }, body: { ...bodyOf(draft), version, enabled } });
    },
    [mutate, id],
  );
  return {
    save,
    saving: mutation.isPending,
    saved: mutation.isSuccess,
    failure: failureOf(mutation.error),
    reset,
  };
}

export interface WebhookActionsViewModel {
  /** Queues one signed `webhook.test` delivery. */
  readonly test: () => void;
  /** Replaces the secret: the old one stops working at once, the new one is shown once. */
  readonly rotate: () => void;
  /** Deletes the webhook and its delivery log; `onDeleted` runs once it is gone. */
  readonly remove: (onDeleted: () => void) => void;
  readonly busy: boolean;
  /** A test was queued. */
  readonly tested: boolean;
  /** The webhook a rotation just gave a new secret. */
  readonly rotated: CreatedWebhook | undefined;
  readonly failure: Error | undefined;
  /** Hides the new secret: the person copied it. */
  readonly dismiss: () => void;
}

export function useWebhookActions(id: string): WebhookActionsViewModel {
  const queryClient = useQueryClient();
  const testing = useMutation({
    ...testWebhookMutation(),
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: listWebhookDeliveriesQueryKey({ path: { id }, query: { limit: DELIVERIES_SHOWN } }),
      });
    },
  });
  const rotation = useMutation({
    ...rotateWebhookSecretMutation(),
    ...FORGET_AT_ONCE,
    onSuccess: (created) => {
      queryClient.setQueryData(getWebhookQueryKey({ path: { id } }), created.webhook);
    },
  });
  const removal = useMutation({
    ...deleteWebhookMutation(),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: getWebhookQueryKey({ path: { id } }) });
      void queryClient.invalidateQueries({ queryKey: listWebhooksQueryKey() });
    },
  });
  const { mutate: testMutate, reset: resetTest } = testing;
  const { mutate: rotateMutate, reset: resetRotation } = rotation;
  const { mutate: removeMutate, reset: resetRemoval } = removal;
  // A new secret, shown once, locks every other gesture (`locked` in the actions) until it is copied: when a test or a
  // deletion starts, the rotation holds at most its failure, which is cleared like the others'.
  const test = useCallback(() => {
    resetRemoval();
    resetRotation();
    testMutate({ path: { id } });
  }, [testMutate, resetRemoval, resetRotation, id]);
  const rotate = useCallback(() => {
    resetTest();
    resetRemoval();
    rotateMutate({ path: { id } });
  }, [rotateMutate, resetTest, resetRemoval, id]);
  const remove = useCallback(
    (onDeleted: () => void) => {
      resetTest();
      resetRotation();
      removeMutate({ path: { id } }, { onSuccess: onDeleted });
    },
    [removeMutate, resetTest, resetRotation, id],
  );
  return {
    test,
    rotate,
    remove,
    busy: testing.isPending || rotation.isPending || removal.isPending,
    tested: testing.isSuccess,
    rotated: rotation.data,
    failure: failureOf(testing.error ?? rotation.error ?? removal.error),
    dismiss: resetRotation,
  };
}
