// Temporary deployment marker — proves which web build is loaded.
export const WEB_BUILD =
  import.meta.env.VITE_BUILD_SHA
  ?? (import.meta.env.DEV ? `dev@${new Date().toISOString()}` : 'unknown');
