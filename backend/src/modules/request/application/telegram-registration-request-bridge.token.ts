/** Injection token — keeps Nest circular graphs from loading the class at module-eval time (SWC TDZ). */
export const TELEGRAM_REGISTRATION_REQUEST_BRIDGE = Symbol('TELEGRAM_REGISTRATION_REQUEST_BRIDGE');
