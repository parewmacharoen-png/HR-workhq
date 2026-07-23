import { apiGet } from './client';

export function qaReadiness() {
  return apiGet<Record<string, unknown>>('/qa/readiness');
}

export function qaModules() {
  return apiGet<Array<Record<string, unknown>>>('/qa/modules');
}

export function qaHealth() {
  return apiGet<Record<string, unknown>>('/qa/health');
}

export function qaUatStatus() {
  return apiGet<Record<string, unknown>>('/qa/uat-status');
}

export function qaTraceability() {
  return apiGet<Record<string, unknown>>('/qa/traceability');
}
