// ============================================================================
// auth/decorators/skip-password-change.decorator.ts
// Allows authenticated routes while must_change_password is still set (e.g. change-password).
// ============================================================================

import { SetMetadata } from '@nestjs/common';

export const SKIP_PASSWORD_CHANGE_KEY = 'skip_password_change';
export const SkipPasswordChange = () => SetMetadata(SKIP_PASSWORD_CHANGE_KEY, true);
