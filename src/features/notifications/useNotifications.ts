// SPDX-License-Identifier: Apache-2.0
import {
  deletePushDeviceMutation,
  getNotificationPreferencesOptions,
  getNotificationPreferencesQueryKey,
  getNotificationSettingsOptions,
  getNotificationSettingsQueryKey,
  listPushDevicesOptions,
  listPushDevicesQueryKey,
  getSlackLinkOptions,
  getSlackLinkQueryKey,
  linkSlackMutation,
  sendTestPushMutation,
  setNotificationPreferencesMutation,
  setNotificationSettingMutation,
  unlinkSlackMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type {
  NotificationPreferences,
  NotificationSettingChange,
  NotificationSettings,
  PushDevice,
  PushTestResults,
  SlackLink,
} from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';

export interface NotificationSwitchesViewModel {
  /** The channels the server offers and every switch in force; undefined until they are read. */
  readonly settings: NotificationSettings | undefined;
  readonly failure: Error | undefined;
  /** Turns one kind on or off on one channel, at once: the server answers every switch in force. */
  readonly toggle: (change: NotificationSettingChange) => void;
  /** The switch on its way to the server, if any. */
  readonly pending: NotificationSettingChange | undefined;
  readonly toggleFailure: Error | undefined;
}

/** `GET`/`PUT /notifications/settings`: what the member is told about, per kind and channel, in this organization. */
export function useNotificationSwitches(enabled: boolean): NotificationSwitchesViewModel {
  const queryClient = useQueryClient();
  const query = useQuery(ready(getNotificationSettingsOptions(), { enabled, retry: false }));
  const mutation = useMutation({
    ...setNotificationSettingMutation(),
    onSuccess: (settings) => {
      queryClient.setQueryData(getNotificationSettingsQueryKey(), settings);
    },
  });
  const { mutate } = mutation;
  // Set in the click itself: the mutation's own state reaches the screen a tick later, and until then the switch
  // would still show what it was (a person, or a test, reading it right after the click would see nothing change).
  const [pending, setPending] = useState<NotificationSettingChange | undefined>(undefined);
  return {
    settings: query.data,
    failure: failureOf(query.error),
    toggle: (change) => {
      setPending(change);
      mutate(
        { body: change },
        {
          onSettled: () => {
            setPending(undefined);
          },
        },
      );
    },
    pending,
    toggleFailure: failureOf(mutation.error),
  };
}

export interface PhonePreferencesViewModel {
  /** What the person is told on their phone, across their organizations; undefined until it is read. */
  readonly preferences: NotificationPreferences | undefined;
  readonly failure: Error | undefined;
  /** Saves them; `onDone` gets what the server stored. */
  readonly save: (
    preferences: NotificationPreferences,
    onDone: (saved: NotificationPreferences) => void,
  ) => void;
  readonly saving: boolean;
  readonly saveFailure: Error | undefined;
}

/** `GET`/`PUT /me/notifications`: the person's own phone preferences, in no organization. */
export function usePhonePreferences(enabled: boolean): PhonePreferencesViewModel {
  const queryClient = useQueryClient();
  const query = useQuery(ready(getNotificationPreferencesOptions(), { enabled, retry: false }));
  const mutation = useMutation({
    ...setNotificationPreferencesMutation(),
    onSuccess: (preferences) => {
      queryClient.setQueryData(getNotificationPreferencesQueryKey(), preferences);
    },
  });
  const { mutate } = mutation;
  return {
    preferences: query.data,
    failure: failureOf(query.error),
    save: (preferences, onDone) => {
      mutate(
        { body: preferences },
        {
          onSuccess: (saved) => {
            onDone(saved);
          },
        },
      );
    },
    saving: mutation.isPending,
    saveFailure: failureOf(mutation.error),
  };
}

export interface TestPushViewModel {
  readonly send: () => void;
  readonly sending: boolean;
  /** The last test's results, per installation. */
  readonly results: PushTestResults | undefined;
  readonly failure: Error | undefined;
}

/** `POST /notifications/push/test`: one test notification to each of the caller's phones. */
export function useTestPush(): TestPushViewModel {
  const mutation = useMutation(sendTestPushMutation());
  const { mutate } = mutation;
  return {
    send: () => {
      mutate({});
    },
    sending: mutation.isPending,
    results: mutation.data,
    failure: failureOf(mutation.error),
  };
}

export interface PushDevicesViewModel {
  /** The caller's phones, the most recently seen first; undefined until they are read. */
  readonly phones: readonly PushDevice[] | undefined;
  readonly failure: Error | undefined;
  /** Stops notifying one phone; the list is read again once the server did. */
  readonly remove: (phone: PushDevice) => void;
  /** The phone on its way out, if any. */
  readonly removing: string | undefined;
  readonly removeFailure: Error | undefined;
}

/** `GET /push-devices` and `DELETE /push-devices/{id}`: the phones the caller is notified on, in this organization. */
export function usePushDevices(enabled: boolean): PushDevicesViewModel {
  const queryClient = useQueryClient();
  const query = useQuery(ready(listPushDevicesOptions(), { enabled, retry: false }));
  const relist = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: listPushDevicesQueryKey() });
  };
  const mutation = useMutation({ ...deletePushDeviceMutation(), onSuccess: relist, onError: relist });
  const { mutate } = mutation;
  return {
    phones: query.data?.items,
    failure: failureOf(query.error),
    remove: (phone) => {
      mutate({ path: { id: phone.id } });
    },
    removing: mutation.isPending ? mutation.variables.path.id : undefined,
    removeFailure: failureOf(mutation.error),
  };
}

export interface SlackLinkViewModel {
  /** The member's Slack link in this organization; undefined until it is read. */
  readonly link: SlackLink | undefined;
  readonly failure: Error | undefined;
  /** Links the Slack account of the member's proven e-mail address. */
  readonly connect: () => void;
  /** Removes the link. */
  readonly disconnect: () => void;
  /** A link or an unlink on its way. */
  readonly busy: boolean;
  readonly actionFailure: Error | undefined;
}

/** `GET`/`POST`/`DELETE /slack/link` (`slack.v1`): the member's own Slack account, in this organization. */
export function useSlackLink(enabled: boolean): SlackLinkViewModel {
  const queryClient = useQueryClient();
  const query = useQuery(ready(getSlackLinkOptions(), { enabled, retry: false }));
  const link = useMutation({
    ...linkSlackMutation(),
    onSuccess: (linked) => {
      queryClient.setQueryData(getSlackLinkQueryKey(), linked);
    },
  });
  const unlink = useMutation({
    ...unlinkSlackMutation(),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: getSlackLinkQueryKey() }),
  });
  return {
    link: query.data,
    failure: failureOf(query.error),
    connect: () => {
      unlink.reset();
      link.mutate({});
    },
    disconnect: () => {
      link.reset();
      unlink.mutate({});
    },
    busy: link.isPending || unlink.isPending,
    actionFailure: failureOf(link.error ?? unlink.error),
  };
}
