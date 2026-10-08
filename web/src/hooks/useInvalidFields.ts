import { useCallback, useState } from 'react';

/** Tracks which fields currently hold invalid input, so a save button can stay disabled. */
export function useInvalidFields() {
  const [invalid, setInvalid] = useState<ReadonlySet<string>>(() => new Set());
  const report = useCallback((key: string, valid: boolean) => {
    setInvalid((prev) => {
      if (prev.has(key) === !valid) return prev;
      const next = new Set(prev);
      if (valid) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  return { hasInvalid: invalid.size > 0, report };
}
