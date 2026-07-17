import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { RequestContextService } from './request-context.service';

const acceptedRequestId = /^[A-Za-z0-9._:-]{1,128}$/;
export type RequestWithRequestId = Request & { requestId?: string };

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const supplied = request.headers['x-request-id'];
    const requestId =
      typeof supplied === 'string' && acceptedRequestId.test(supplied)
        ? supplied
        : randomUUID();

    (request as RequestWithRequestId).requestId = requestId;
    response.setHeader('x-request-id', requestId);
    this.requestContext.run({ requestId }, next);
  }
}
