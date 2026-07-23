import { extractReferenceCode } from '../lib/sanitize-api-error';
import { WorkHQErrorState } from './workhq/states/WorkHQErrorState';

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <WorkHQErrorState
      referenceCode={extractReferenceCode(error)}
      onRetry={onRetry}
    />
  );
}
