import type { ReactNode } from 'react';
import { WorkHQEmptyState } from './WorkHQEmptyState';
import { WorkHQErrorState } from './WorkHQErrorState';
import { WorkHQLoadingState } from './WorkHQLoadingState';
import { WorkHQPermissionDenied } from './WorkHQPermissionDenied';

export type PageState = 'loading' | 'success' | 'empty' | 'error' | 'permissionDenied';

export type WorkHQPageStateProps = {
  state: PageState;
  loading?: ReactNode;
  empty?: ReactNode;
  error?: ReactNode;
  permissionDenied?: ReactNode;
  children: ReactNode;
};

export function WorkHQPageState({
  state,
  loading,
  empty,
  error,
  permissionDenied,
  children,
}: WorkHQPageStateProps) {
  switch (state) {
    case 'loading':
      return <>{loading ?? <WorkHQLoadingState />}</>;
    case 'empty':
      return <>{empty ?? <WorkHQEmptyState title="ไม่มีข้อมูล" />}</>;
    case 'error':
      return <>{error ?? <WorkHQErrorState />}</>;
    case 'permissionDenied':
      return <>{permissionDenied ?? <WorkHQPermissionDenied />}</>;
    case 'success':
    default:
      return <>{children}</>;
  }
}
