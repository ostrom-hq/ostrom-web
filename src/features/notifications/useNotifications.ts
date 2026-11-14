// SPDX-License-Identifier: Apache-2.0
import {
  getNotificationPreferencesOptions,
  getNotificationPreferencesQueryKey,
  getNotificationSettingsOptions,
  getNotificationSettingsQueryKey,
  sendTestPushMutation,
  setNotificationPreferencesMutation,
  setNotificationSettingMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type {
  NotificationPreferences,
  NotificationSettingChange,
  NotificationSettings,
  PushTestResults,
} from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  return {
    settings: query.data,
    failure: failureOf(query.error),
    toggle: (change) => {
      mutate({ body: change });
    },
    pending: mutation.isPending ? mutation.variables.body : undefined,
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
