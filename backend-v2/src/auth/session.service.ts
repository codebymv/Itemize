import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { Response } from 'express';
import { randomBytes } from 'node:crypto';
import { itemizeGraphqlError } from '../common/graphql-error';
import { AuthRepository, AuthenticationUser } from './auth.repository';
import { AuthSessionPayload, AuthSessionStatus, CurrentUser } from './auth.types';

type RefreshTokenPayload = {
  userId?: unknown;
  type?: unknown;
};

type GoogleTokenInfo = {
  aud?: string;
};

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  name?: string;
  email_verified?: boolean | string;
};

const ACCESS_COOKIE = 'itemize_auth';
const REFRESH_COOKIE = 'itemize_refresh';
const ACCESS_SECONDS = 15 * 60;
const REFRESH_SECONDS = 30 * 24 * 60 * 60;

@Injectable()
export class SessionService {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: AuthRepository,
  ) {}

  async login(
    rawEmail: string,
    password: string,
    response: Response,
  ): Promise<AuthSessionPayload> {
    const email = this.email(rawEmail);
    if (typeof password !== 'string' || password.length === 0) {
      throw itemizeGraphqlError('Password is required', 'BAD_USER_INPUT', {
        field: 'password',
      });
    }
    const user = await this.users.findByEmail(email);
    if (!user) this.invalidCredentials();
    if (user.provider === 'google' || !user.passwordHash) {
      throw itemizeGraphqlError(
        'This email is registered with Google. Please sign in with Google.',
        'BAD_USER_INPUT',
        { reason: 'GOOGLE_ACCOUNT' },
      );
    }
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      this.invalidCredentials();
    }
    if (!user.emailVerified) {
      throw itemizeGraphqlError(
        'Email not verified. Please check your email to verify your account.',
        'UNAUTHENTICATED',
        { reason: 'EMAIL_NOT_VERIFIED' },
      );
    }
    await this.establish(user, response);
    return { success: true, user: this.sessionUser(user) };
  }

  async googleLogin(
    accessToken: string,
    response: Response,
  ): Promise<AuthSessionPayload> {
    const identity = await this.verifyGoogleAccessToken(accessToken);
    const user = await this.users.findOrCreateGoogleUser(identity);
    await this.establish(user, response);
    return { success: true, user: this.sessionUser(user) };
  }

  async currentUser(userId: number): Promise<CurrentUser> {
    const user = await this.users.findById(userId);
    if (!user) throw itemizeGraphqlError('User not found', 'NOT_FOUND');
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      provider: user.provider || 'email',
      emailVerified: user.emailVerified,
      role: user.role,
      createdAt: user.createdAt,
    };
  }

  async refresh(
    refreshToken: unknown,
    response: Response,
  ): Promise<AuthSessionStatus> {
    if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
      throw itemizeGraphqlError('No refresh token provided', 'UNAUTHENTICATED');
    }
    const secret = this.secret();
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(refreshToken, { secret });
    } catch {
      throw itemizeGraphqlError('Invalid or expired refresh token', 'UNAUTHENTICATED');
    }
    const userId = Number(payload.userId);
    if (payload.type !== 'refresh' || !Number.isSafeInteger(userId) || userId <= 0) {
      throw itemizeGraphqlError('Invalid refresh token', 'UNAUTHENTICATED');
    }
    const user = await this.users.findById(userId);
    if (!user) throw itemizeGraphqlError('User not found', 'UNAUTHENTICATED');
    if (!user.emailVerified) {
      throw itemizeGraphqlError('Email not verified', 'UNAUTHENTICATED', {
        reason: 'EMAIL_NOT_VERIFIED',
      });
    }
    const accessToken = await this.signAccessToken(user);
    response.cookie(ACCESS_COOKIE, accessToken, this.cookieOptions(ACCESS_SECONDS));
    this.noStore(response);
    return { success: true };
  }

  logout(response: Response): AuthSessionStatus {
    response.cookie(ACCESS_COOKIE, '', this.cookieOptions(0));
    response.cookie(REFRESH_COOKIE, '', this.cookieOptions(0));
    this.noStore(response);
    return { success: true };
  }

  csrfToken(existingToken: unknown, response: Response): string {
    const token = typeof existingToken === 'string' && existingToken.length > 0
      ? existingToken
      : randomBytes(32).toString('base64url');
    if (token !== existingToken) {
      response.cookie('csrf-token', token, this.cookieOptions(24 * 60 * 60));
    }
    response.setHeader('X-CSRF-Token', token);
    this.noStore(response);
    return token;
  }

  private async establish(user: AuthenticationUser, response: Response): Promise<void> {
    const [accessToken, refreshToken] = await Promise.all([
      this.signAccessToken(user),
      this.jwt.signAsync(
        { userId: user.id, type: 'refresh' },
        { secret: this.secret(), expiresIn: REFRESH_SECONDS },
      ),
    ]);
    response.cookie(ACCESS_COOKIE, accessToken, this.cookieOptions(ACCESS_SECONDS));
    response.cookie(REFRESH_COOKIE, refreshToken, this.cookieOptions(REFRESH_SECONDS));
    this.noStore(response);
  }

  private signAccessToken(user: AuthenticationUser): Promise<string> {
    return this.jwt.signAsync(
      { id: user.id, email: user.email, name: user.name },
      { secret: this.secret(), expiresIn: ACCESS_SECONDS },
    );
  }

  private cookieOptions(maxAgeSeconds: number) {
    const domain = process.env.COOKIE_DOMAIN?.trim();
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
      maxAge: maxAgeSeconds * 1000,
      path: '/',
      ...(domain ? { domain } : {}),
    };
  }

  private async verifyGoogleAccessToken(accessToken: string) {
    if (
      typeof accessToken !== 'string' ||
      accessToken.length === 0 ||
      accessToken.length > 4_096
    ) {
      throw itemizeGraphqlError('Google access token is required', 'BAD_USER_INPUT', {
        reason: 'GOOGLE_ACCESS_TOKEN_REQUIRED',
      });
    }
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw itemizeGraphqlError('Google sign-in is unavailable', 'SERVICE_UNAVAILABLE');
    }
    try {
      const tokenInfoResponse = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
        { signal: AbortSignal.timeout(5_000) },
      );
      const tokenInfo = (await tokenInfoResponse.json()) as GoogleTokenInfo;
      if (!tokenInfoResponse.ok || tokenInfo.aud !== clientId) throw new Error('Invalid audience');

      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(5_000),
      });
      const profile = (await userInfoResponse.json()) as GoogleUserInfo;
      const email = this.email(profile.email || '');
      const name = (profile.name || email.split('@')[0]).trim();
      const verified = profile.email_verified === true || profile.email_verified === 'true';
      if (!userInfoResponse.ok || !profile.sub || !verified || name.length < 1 || name.length > 100) {
        throw new Error('Invalid Google identity');
      }
      return { googleId: profile.sub, email, name };
    } catch {
      throw itemizeGraphqlError('Invalid Google access token', 'UNAUTHENTICATED', {
        reason: 'INVALID_GOOGLE_TOKEN',
      });
    }
  }

  private email(value: string): string {
    const email = value?.trim().toLowerCase();
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw itemizeGraphqlError('A valid email address is required', 'BAD_USER_INPUT', {
        field: 'email',
      });
    }
    return email;
  }

  private invalidCredentials(): never {
    throw itemizeGraphqlError('Invalid email or password', 'UNAUTHENTICATED', {
      reason: 'INVALID_CREDENTIALS',
    });
  }

  private sessionUser(user: AuthenticationUser) {
    return {
      uid: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      photoURL: `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`,
    };
  }

  private secret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw itemizeGraphqlError('Authentication service is unavailable', 'SERVICE_UNAVAILABLE');
    return secret;
  }

  private noStore(response: Response): void {
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Expires', '0');
  }
}
