import { describe, expect, it } from 'vitest';
import { filterNavGroups, NAV_GROUPS } from './nav-config';

describe('filterNavGroups HR mode', () => {
  const allPermissions = NAV_GROUPS.flatMap((g) =>
    g.items.flatMap((i) => i.permissions ?? []),
  );

  it('uses task-first main group with 12 sidebar items when fully permitted', () => {
    const groups = filterNavGroups(allPermissions, false);
    const ids = groups.map((g) => g.id);
    expect(ids).toContain('main');
    expect(ids).not.toContain('marketing');
    expect(ids).not.toContain('executive');
    const mainPaths = groups.find((g) => g.id === 'main')?.items.map((i) => i.path) ?? [];
    expect(mainPaths).toContain('/dashboard');
    expect(mainPaths).toContain('/payroll/cycles');
    expect(mainPaths).toContain('/hr/employees');
    expect(mainPaths).toContain('/hr/assets');
    expect(mainPaths).toContain('/requests');
  });

  it('exposes settings hub in main sidebar for settings readers', () => {
    const groups = filterNavGroups(['settings:read'], false);
    const mainPaths = groups.find((g) => g.id === 'main')?.items.map((i) => i.path) ?? [];
    expect(mainPaths).toContain('/settings');
    expect(mainPaths).not.toContain('/admin/workflows');
  });

  it('shows admin commission in HR mode sidebar', () => {
    const groups = filterNavGroups(allPermissions, false);
    const mainPaths = groups.find((g) => g.id === 'main')?.items.map((i) => i.path) ?? [];
    expect(mainPaths).toContain('/commission/admin');
    expect(mainPaths).not.toContain('/commission');
  });

  it('shows marketing group when marketing is enabled', () => {
    const groups = filterNavGroups(allPermissions, true);
    const ids = groups.map((g) => g.id);
    expect(ids).toContain('marketing');
    const mainPaths = groups.find((g) => g.id === 'main')?.items.map((i) => i.path) ?? [];
    expect(mainPaths).toContain('/commission');
  });
});
