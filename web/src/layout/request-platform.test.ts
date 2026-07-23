import { describe, expect, it } from 'vitest';
import { filterNavGroups } from '../layout/nav-config';

describe('request platform nav', () => {
  it('shows request center for workflow readers in main sidebar', () => {
    const groups = filterNavGroups(['workflow:read'], false);
    const main = groups.find((g) => g.id === 'main');
    expect(main?.items.some((i) => i.path === '/requests')).toBe(true);
  });
});
