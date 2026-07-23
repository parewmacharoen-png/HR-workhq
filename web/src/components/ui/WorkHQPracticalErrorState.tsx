import { ApiError } from '../../api/client';
import { WorkHQErrorState } from '../workhq/states/WorkHQErrorState';
import { extractReferenceCode } from '../../lib/sanitize-api-error';

/** @deprecated Use WorkHQErrorState from components/workhq */
export function WorkHQPracticalErrorState({
  error,
  onRetry,
  referenceCode,
}: {
  error: unknown;
  onRetry?: () => void;
  referenceCode?: string;
}) {
  const ref = referenceCode ?? extractReferenceCode(error);
  if (error instanceof ApiError) {
    return <WorkHQErrorState referenceCode={error.requestId ?? ref} onRetry={onRetry} />;
  }
  return <WorkHQErrorState referenceCode={ref} onRetry={onRetry} />;
}
