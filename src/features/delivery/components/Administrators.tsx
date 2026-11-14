// SPDX-License-Identifier: Apache-2.0
import { Navigate } from '@tanstack/react-router';
import type { ReactElement, ReactNode } from 'react';
import { useViewer } from '@/shared/auth/useViewer';
import { Skeleton } from '@/shared/ui/Skeleton';

export interface AdministratorsProps {
  /** Where a member who is not an administrator is sent: their own delivered skills or hooks. */
  readonly delivered: 'skills' | 'hooks';
  readonly children: ReactNode;
}

/**
 * The catalog is for owners and admins (the server answers 403 otherwise): anyone else is sent to what is delivered to
 * them, as TeamCode does, without asking the catalog anything. Until the viewer is known (their member answers with their
 * role), the shape of the screen.
 */
export function Administrators({ delivered, children }: AdministratorsProps): ReactElement {
  const { canManage, memberId } = useViewer();
  if (canManage) return <>{children}</>;
  if (memberId === undefined) return <Skeleton rows={3} />;
  return delivered === 'skills' ? (
    <Navigate to="/members/$memberId/skills" params={{ memberId }} replace />
  ) : (
    <Navigate to="/members/$memberId/hooks" params={{ memberId }} replace />
  );
}
