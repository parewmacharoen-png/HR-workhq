// ============================================================================
// common/middleware/request-context.middleware.ts
// Runs first in the chain: assigns/propagates an x-request-id and opens the
// AsyncLocalStorage scope for the request. The actor is filled in later by the
// JWT strategy once the token is verified.
// ============================================================================

import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RequestContextService } from '../context/request-context';

interface ReqLike {
  headers: Record<string, string | string[] | undefined>;
}
interface ResLike {
  setHeader(name: string, value: string): void;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly ctx: RequestContextService) {}

  use(req: ReqLike, res: ResLike, next: () => void): void {
    const incoming = req.headers['x-request-id'];
    const requestId = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
    res.setHeader('x-request-id', requestId);

    this.ctx.run(
      { requestId, actor: null, startedAt: Date.now() },
      () => next(),
    );
  }
}
