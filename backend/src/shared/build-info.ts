// Temporary deployment marker — proves which backend build is running.
export const WORKHQ_BUILD =
  process.env['WORKHQ_BUILD_SHA']
  ?? process.env['GIT_COMMIT']
  ?? `dev@${new Date().toISOString()}`;
