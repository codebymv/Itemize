import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  AuthenticatedIdentity,
  ItemizeRequestContext,
  OrganizationIdentity,
} from './request-context.types';

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<ItemizeRequestContext>();

  run<T>(context: ItemizeRequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  current(): ItemizeRequestContext {
    const context = this.storage.getStore();
    if (!context) {
      throw new Error('Request context is unavailable');
    }
    return context;
  }

  setIdentity(identity: AuthenticatedIdentity): void {
    this.current().identity = identity;
  }

  setOrganization(organization: OrganizationIdentity): void {
    this.current().organization = organization;
  }
}
