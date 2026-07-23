import { describe, expect, it } from 'vitest';
import {
  archiveKpiTemplate,
  assignKpiCycle,
  cloneKpiTemplate,
  createKpiCycle,
  createKpiTemplate,
  deleteKpiTemplate,
  fetchEmployeeKpi,
  fetchKpiCycleAssignments,
  fetchKpiCycles,
  fetchKpiDashboard,
  fetchKpiTemplates,
  fetchKpiTemplatesByPosition,
  finalizeKpiAssignment,
  submitKpiAssignment,
  updateKpiScores,
  updateKpiTemplate,
  versionKpiTemplate,
} from './kpi';

describe('kpi API client', () => {
  it('exports workflow helpers', () => {
    expect(typeof fetchKpiTemplates).toBe('function');
    expect(typeof createKpiTemplate).toBe('function');
    expect(typeof updateKpiTemplate).toBe('function');
    expect(typeof fetchKpiTemplatesByPosition).toBe('function');
    expect(typeof cloneKpiTemplate).toBe('function');
    expect(typeof archiveKpiTemplate).toBe('function');
    expect(typeof deleteKpiTemplate).toBe('function');
    expect(typeof versionKpiTemplate).toBe('function');
    expect(typeof fetchKpiCycles).toBe('function');
    expect(typeof createKpiCycle).toBe('function');
    expect(typeof assignKpiCycle).toBe('function');
    expect(typeof fetchKpiCycleAssignments).toBe('function');
    expect(typeof fetchKpiDashboard).toBe('function');
    expect(typeof fetchEmployeeKpi).toBe('function');
    expect(typeof updateKpiScores).toBe('function');
    expect(typeof submitKpiAssignment).toBe('function');
    expect(typeof finalizeKpiAssignment).toBe('function');
  });
});
