import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { Response } from 'express';
import { AuthRepository, AuthenticationUser } from './auth.repository';
import { SessionService } from './session.service';

const user = (overrides: Partial<AuthenticationUser> = {}): AuthenticationUser => ({
  id: 7,
  email: 'member@example.com',
  name: 'Member',
  passwordHash: bcrypt.hashSync('correct-password', 4),
  provider: 'email',
  emailVerified: true,
  role: 'USER',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

const response = () => ({
  cookie: jest.fn(),
  setHeader: jest.fn(),
}) as unknown as Response;

describe('SessionService', () => {
  const originalEnvironment = { ...process.env };
  let repository: jest.Mocked<Pick<AuthRepository, 'findByEmail' | 'findById' | 'findOrCreateGoogleUser'>>;
  let jwt: jest.Mocked<Pick<JwtService, 'signAsync' | 'verifyAsync'>>;
  let service: SessionService;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.NODE_ENV = 'test';
    repository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findOrCreateGoogleUser: jest.fn(),
    };
    jwt = {
      signAsync: jest.fn()
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token'),
      verifyAsync: jest.fn(),
    };
    service = new SessionService(
      jwt as unknown as JwtService,
      repository as unknown as AuthRepository,
    );
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.GOOGLE_CLIENT_ID;
  });

  it('establishes access and refresh cookies after verified password login', async () => {
    repository.findByEmail.mockResolvedValue(user());
    const res = response();

    const result = await service.login(' MEMBER@example.com ', 'correct-password', res);

    expect(result.success).toBe(true);
    expect(result.user).toMatchObject({ uid: 7, email: 'member@example.com' });
    expect(res.cookie).toHaveBeenNthCalledWith(
      1,
      'itemize_auth',
      'access-token',
      expect.objectContaining({ httpOnly: true, maxAge: 900_000 }),
    );
    expect(res.cookie).toHaveBeenNthCalledWith(
      2,
      'itemize_refresh',
      'refresh-token',
      expect.objectContaining({ httpOnly: true, maxAge: 2_592_000_000 }),
    );
  });

  it('fails closed for an invalid password without issuing cookies', async () => {
    repository.findByEmail.mockResolvedValue(user());
    const res = response();

    await expect(service.login('member@example.com', 'wrong', res)).rejects.toMatchObject({
      extensions: expect.objectContaining({ code: 'UNAUTHENTICATED', reason: 'INVALID_CREDENTIALS' }),
    });
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('refreshes only a verified refresh-token identity', async () => {
    jwt.verifyAsync.mockResolvedValue({ userId: 7, type: 'refresh' });
    jwt.signAsync.mockReset().mockResolvedValue('new-access-token');
    repository.findById.mockResolvedValue(user());
    const res = response();

    await expect(service.refresh('refresh-token', res)).resolves.toEqual({ success: true });
    expect(res.cookie).toHaveBeenCalledWith(
      'itemize_auth',
      'new-access-token',
      expect.objectContaining({ maxAge: 900_000 }),
    );
  });

  it('clears both authentication cookies on logout', () => {
    const res = response();

    expect(service.logout(res)).toEqual({ success: true });
    expect(res.cookie).toHaveBeenCalledWith(
      'itemize_auth',
      '',
      expect.objectContaining({ maxAge: 0 }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'itemize_refresh',
      '',
      expect.objectContaining({ maxAge: 0 }),
    );
  });

  it('issues and reuses the double-submit CSRF token', () => {
    const firstResponse = response();
    const issued = service.csrfToken(undefined, firstResponse);

    expect(issued).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(firstResponse.cookie).toHaveBeenCalledWith(
      'csrf-token',
      issued,
      expect.objectContaining({ httpOnly: true, maxAge: 86_400_000 }),
    );

    const secondResponse = response();
    expect(service.csrfToken(issued, secondResponse)).toBe(issued);
    expect(secondResponse.cookie).not.toHaveBeenCalled();
    expect(secondResponse.setHeader).toHaveBeenCalledWith('X-CSRF-Token', issued);
  });

  it('derives a verified Google identity server-side before issuing cookies', async () => {
    process.env.GOOGLE_CLIENT_ID = 'google-client';
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ aud: 'google-client' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        sub: 'google-user-id',
        email: ' Google.Member@Example.com ',
        name: 'Google Member',
        email_verified: true,
      }), { status: 200 }));
    repository.findOrCreateGoogleUser.mockResolvedValue(user({
      email: 'google.member@example.com',
      name: 'Google Member',
      provider: 'google',
      passwordHash: null,
    }));
    const res = response();

    await expect(service.googleLogin('provider-token', res)).resolves.toMatchObject({
      success: true,
      user: { email: 'google.member@example.com', name: 'Google Member' },
    });
    expect(repository.findOrCreateGoogleUser).toHaveBeenCalledWith({
      googleId: 'google-user-id',
      email: 'google.member@example.com',
      name: 'Google Member',
    });
    expect(res.cookie).toHaveBeenCalledTimes(2);
  });

  it('fails closed on the wrong Google audience without touching PostgreSQL', async () => {
    process.env.GOOGLE_CLIENT_ID = 'expected-client';
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ aud: 'other-client' }), { status: 200 }),
    );
    const res = response();

    await expect(service.googleLogin('provider-token', res)).rejects.toMatchObject({
      extensions: expect.objectContaining({
        code: 'UNAUTHENTICATED',
        reason: 'INVALID_GOOGLE_TOKEN',
      }),
    });
    expect(repository.findOrCreateGoogleUser).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });
});
