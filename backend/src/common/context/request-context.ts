// ============================================================================
// common/context/request-context.ts
// AsyncLocalStorage-based request context. Holds the request id and the
// resolved ActorContext so any layer (services, audit) can access "who is
// acting" without passing it through every method signature.
// ============================================================================

import { AsyncLocalStorage } from 'async_hooks';
import { Injectable } from '@nestjs/common';
import { ActorContext } from '../../shared/kernel/actor-context';

export interface RequestStore {
  requestId: string;
  actor: ActorContext | null;
  startedAt: number;
  workflowId?: string | null;
  /**
   * The acting user's permission context, loaded once per request. Services check
   * access many times per request; each load is ~7 queries to the database.
   */
  actorAuthContext?: { userId: string; load: Promise<unknown> };
}

const storage = new AsyncLocalStorage<RequestStore>();

@Injectable()
export class RequestContextService {
  run<T>(store: RequestStore, fn: () => T): T {
    return storage.run(store, fn);
  }

  get(): RequestStore | undefined {
    return storage.getStore();
  }

  get requestId(): string | null {
    return storage.getStore()?.requestId ?? null;
  }

  get actor(): ActorContext | null {
    return storage.getStore()?.actor ?? null;
  }

  setActor(actor: ActorContext): void {
    const store = storage.getStore();
    if (store) store.actor = actor;
  }

  setWorkflowId(workflowId: string | null): void {
    const store = storage.getStore();
    if (store) store.workflowId = workflowId;
  }

  get workflowId(): string | null {
    return storage.getStore()?.workflowId ?? null;
  }
}

// Static accessor for non-DI call sites (e.g. logging formatters).
export const RequestContext = {
  current(): RequestStore | undefined {
    return storage.getStore();
  },
};
