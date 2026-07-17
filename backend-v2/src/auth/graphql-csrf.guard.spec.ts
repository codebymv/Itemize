import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GraphQLError } from 'graphql';
import { GraphqlCsrfGuard } from './graphql-csrf.guard';

const contextFor = (request: Record<string, unknown>): ExecutionContext => ({
  getArgs: () => [undefined, undefined, { req: request }, undefined],
  getArgByIndex: (index: number) => [undefined, undefined, { req: request }, undefined][index],
  getClass: () => class TestResolver {},
  getHandler: () => function testMutation() {},
  getType: () => 'graphql',
  switchToHttp: jest.fn() as never,
  switchToRpc: jest.fn() as never,
  switchToWs: jest.fn() as never,
}) as ExecutionContext;

describe('GraphqlCsrfGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as jest.Mocked<Reflector>;
  const guard = new GraphqlCsrfGuard(reflector);

  beforeEach(() => jest.resetAllMocks());

  it('does not require CSRF for undecorated operations', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    expect(guard.canActivate(contextFor({ headers: {}, cookies: {} }))).toBe(true);
  });

  it.each([
    [{ cookies: {}, headers: {} }, 'CSRF_COOKIE_MISSING'],
    [{ cookies: { 'csrf-token': 'proof' }, headers: {} }, 'CSRF_TOKEN_MISSING'],
    [{ cookies: { 'csrf-token': 'proof' }, headers: { 'x-csrf-token': 'wrong' } }, 'CSRF_TOKEN_MISMATCH'],
  ])('rejects invalid CSRF proof', (request, reason) => {
    reflector.getAllAndOverride.mockReturnValue(true);
    try {
      guard.canActivate(contextFor(request));
      throw new Error('Expected CSRF rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(GraphQLError);
      expect((error as GraphQLError).extensions).toMatchObject({
        code: 'FORBIDDEN',
        reason,
      });
    }
  });

  it('accepts an exact cookie/header match', () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    expect(guard.canActivate(contextFor({
      cookies: { 'csrf-token': 'proof' },
      headers: { 'x-csrf-token': 'proof' },
    }))).toBe(true);
  });
});
