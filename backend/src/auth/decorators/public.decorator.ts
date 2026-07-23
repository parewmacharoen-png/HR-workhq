// ============================================================================
// auth/decorators/public.decorator.ts
// Marks a route as public (skips JwtAuthGuard). Used for /health, /auth/login.
// ============================================================================

import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'is_public';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
