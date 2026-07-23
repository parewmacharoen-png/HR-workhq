/** HR product mode — hides MarketingOS web surfaces when marketing is disabled. */

function readEnv(key: string): string | undefined {
  const value = import.meta.env[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** True when marketing/commission/executive web surfaces should be shown. */
export function isMarketingEnabled(): boolean {
  const explicit = readEnv('VITE_MARKETING_ENABLED');
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  const product = readEnv('VITE_PRODUCT');
  if (product === 'hr') return false;
  if (product === 'marketing') return true;
  return false;
}

export const HR_HIDDEN_NAV_GROUP_IDS = new Set(['marketing', 'commission', 'executive']);

export const HR_HIDDEN_SETTINGS_PATHS = new Set(['/settings/commission/marketing']);
