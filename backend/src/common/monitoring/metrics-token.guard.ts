// ============================================================================
// common/monitoring/metrics-token.guard.ts
// Protects /metrics and /health/details when METRICS_TOKEN is set.
// ============================================================================

import {
  CanActivate, ExecutionContext, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';

@Injectable()
export class MetricsTokenGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const token = this.config.metricsToken;
    if (!token) return true;

    const req = context.switchToHttp().getRequest<{ headers: { authorization?: string } }>();
    if (req.headers.authorization === `Bearer ${token}`) return true;
    throw new UnauthorizedException('Invalid metrics token');
  }
}
