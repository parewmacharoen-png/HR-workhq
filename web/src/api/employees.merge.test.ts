import { describe, expect, it } from 'vitest';
import { mergeEmployeeLists, type EmployeeListItem } from './employees';

const sb = { id: 'co-sb', code: 'SB', name: 'SB Company', isPrimary: true };
const mb = { id: 'co-mb', code: 'MB', name: 'MB Company', isPrimary: false };
const kw = { id: 'co-kw', code: 'KW', name: 'KW Company', isPrimary: true };

function person(id: string, globalId: string, companies: EmployeeListItem['companies']): EmployeeListItem {
  return {
    id, globalId, firstName: id, lastName: '', employmentStatus: 'active',
    telegramLinked: false, username: null, companies,
  };
}

describe('mergeEmployeeLists', () => {
  it('shows a person who works in several companies only once', () => {
    const somchai = person('emp-1', 'EMP000001', [sb, mb]);
    const merged = mergeEmployeeLists([[somchai], [somchai]]);

    expect(merged).toHaveLength(1);
    expect(merged[0].companies?.map((c) => c.code)).toEqual(['SB', 'MB']);
  });

  it('unions company badges when per-company lists disagree', () => {
    const merged = mergeEmployeeLists([
      [person('emp-1', 'EMP000001', [sb])],
      [person('emp-1', 'EMP000001', [mb])],
    ]);

    expect(merged[0].companies?.map((c) => c.code)).toEqual(['SB', 'MB']);
  });

  it('keeps different people separate and sorted by employee ID', () => {
    const merged = mergeEmployeeLists([
      [person('emp-2', 'EMP000002', [kw])],
      [person('emp-1', 'EMP000001', [sb])],
    ]);

    expect(merged.map((e) => e.globalId)).toEqual(['EMP000001', 'EMP000002']);
  });

  it('copes with older API responses that have no companies field', () => {
    const legacy = { ...person('emp-1', 'EMP000001', undefined) };
    delete legacy.companies;

    expect(mergeEmployeeLists([[legacy], [legacy]])).toHaveLength(1);
  });
});
