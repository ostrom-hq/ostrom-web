// SPDX-License-Identifier: AGPL-3.0-only
import { listDecisionsOptions } from '@gen/api/@tanstack/react-query.gen';
import type { Decision } from '@gen/api/types.gen';
import { useQuery } from '@tanstack/react-query';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';

export interface DecisionsViewModel {
  readonly decisions: readonly Decision[] | undefined;
  readonly failure: Error | undefined;
}

export function useDecisions(): DecisionsViewModel {
  const query = useQuery(ready(listDecisionsOptions()));
  return { decisions: query.data?.items, failure: failureOf(query.error) };
}
