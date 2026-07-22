import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { itemizeGraphqlError } from '../common/graphql-error';
import { AuthEmailService } from './auth-email.service';
import { AuthRepository } from './auth.repository';
import { AuthMessagePayload, AuthSessionPayload } from './auth.types';
import { SessionService } from './session.service';

const VERIFICATION_MESSAGE =
  'If an account exists with this email, you will receive a verification link.';
const RESET_MESSAGE =
  'If an account exists with this email, you will receive a password reset link.';

@Injectable()
export class IdentityLifecycleService {
  constructor(
    private readonly users: AuthRepository,
    private readonly emails: AuthEmailService,
    private readonly sessions: SessionService,
  ) {}

  async register(
    rawEmail: string,
    rawPassword: string,
    rawName?: string,
  ): Promise<AuthMessagePayload> {
    const email = this.email(rawEmail);
    const password = this.password(rawPassword);
    const name = this.name(rawName, email);
    const existing = await this.users.findByEmail(email);
    if (existing) {
      const google = existing.provider === 'google' || !existing.passwordHash;
      throw itemizeGraphqlError(
        google
          ? 'This email is already registered with Google. Please sign in with Google.'
          : 'An account with this email already exists.',
        'ACCOUNT_CONFLICT',
        { reason: google ? 'GOOGLE_ACCOUNT_EXISTS' : 'USER_EXISTS' },
      );
    }

    const token = randomBytes(32).toString('hex');
    const user = await this.users.registerEmailUser({
      email,
      name,
      passwordHash: await bcrypt.hash(password, 12),
      verificationTokenHash: this.hashToken(token),
      verificationTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    await this.emails.sendVerification(user, token);
    return {
      success: true,
      message: 'Account created. Please check your email to verify your account.',
      email: user.email,
    };
  }

  async verifyEmail(rawToken: string, response: Response): Promise<AuthSessionPayload> {
    const token = this.token(rawToken);
    const user = await this.users.consumeVerificationToken(this.hashToken(token));
    if (!user) {
      throw itemizeGraphqlError(
        'Invalid or expired verification link.',
        'INVALID_TOKEN',
        { reason: 'INVALID_VERIFICATION_TOKEN' },
      );
    }
    await this.sessions.createSession(user, response);
    await this.emails.sendWelcome(user);
    return {
      success: true,
      user: {
        uid: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        photoURL: `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`,
      },
    };
  }

  async resendVerification(rawEmail: string): Promise<AuthMessagePayload> {
    const email = this.email(rawEmail);
    const token = randomBytes(32).toString('hex');
    const user = await this.users.replaceVerificationToken({
      email,
      tokenHash: this.hashToken(token),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    if (user) await this.emails.sendVerification(user, token);
    return { success: true, message: VERIFICATION_MESSAGE };
  }

  async requestPasswordReset(rawEmail: string): Promise<AuthMessagePayload> {
    const email = this.email(rawEmail);
    const token = randomBytes(32).toString('hex');
    const user = await this.users.replacePasswordResetToken({
      email,
      tokenHash: this.hashToken(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    if (user) void this.emails.sendPasswordReset(user, token);
    return { success: true, message: RESET_MESSAGE };
  }

  async resetPassword(rawToken: string, rawPassword: string): Promise<AuthMessagePayload> {
    const token = this.token(rawToken, 'Reset token is required');
    const password = this.password(rawPassword);
    const user = await this.users.consumePasswordResetToken({
      tokenHash: this.hashToken(token),
      passwordHash: await bcrypt.hash(password, 12),
    });
    if (!user) {
      throw itemizeGraphqlError('Invalid or expired reset link.', 'INVALID_TOKEN', {
        reason: 'INVALID_PASSWORD_RESET_TOKEN',
      });
    }
    await this.emails.sendPasswordChanged(user);
    return {
      success: true,
      message: 'Password has been reset successfully. You can now log in.',
    };
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    rawNewPassword: string,
  ): Promise<AuthMessagePayload> {
    if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
      throw itemizeGraphqlError('Current password is required', 'BAD_USER_INPUT', {
        field: 'currentPassword',
      });
    }
    const newPassword = this.password(rawNewPassword);
    const current = await this.users.findById(userId);
    if (!current) throw itemizeGraphqlError('User not found', 'NOT_FOUND');
    if (current.provider !== 'email' || !current.passwordHash) {
      throw itemizeGraphqlError(
        'This account uses Google sign-in and does not have a password.',
        'BAD_USER_INPUT',
        { reason: 'NO_PASSWORD' },
      );
    }
    if (!(await bcrypt.compare(currentPassword, current.passwordHash))) {
      throw itemizeGraphqlError('Current password is incorrect.', 'UNAUTHENTICATED', {
        reason: 'INVALID_PASSWORD',
      });
    }
    if (await bcrypt.compare(newPassword, current.passwordHash)) {
      throw itemizeGraphqlError(
        'New password must be different from the current password.',
        'BAD_USER_INPUT',
        { reason: 'PASSWORD_UNCHANGED' },
      );
    }
    const user = await this.users.changePasswordIfCurrent({
      userId,
      currentHash: current.passwordHash,
      passwordHash: await bcrypt.hash(newPassword, 12),
    });
    if (!user) {
      throw itemizeGraphqlError('Current password changed during this request.', 'CONFLICT', {
        reason: 'PASSWORD_CHANGED_CONCURRENTLY',
      });
    }
    await this.emails.sendPasswordChanged(user);
    return { success: true, message: 'Password changed successfully.' };
  }

  async updateViewerProfile(userId: number, rawName: string) {
    const name = rawName?.trim();
    if (!name || name.length > 100) {
      throw itemizeGraphqlError(
        name ? 'Name must be 100 characters or less' : 'Name is required',
        'BAD_USER_INPUT',
        { field: 'name' },
      );
    }
    const user = await this.users.updateName(userId, name);
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

  private email(value: string): string {
    const email = value?.trim().toLowerCase();
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw itemizeGraphqlError('A valid email address is required', 'BAD_USER_INPUT', {
        field: 'email',
      });
    }
    return email;
  }

  private password(value: string): string {
    if (
      typeof value !== 'string' ||
      value.length < 8 ||
      value.length > 128 ||
      !/[A-Z]/.test(value) ||
      !/[a-z]/.test(value) ||
      !/[0-9]/.test(value)
    ) {
      throw itemizeGraphqlError(
        'Password must be 8-128 characters and include uppercase, lowercase, and a number',
        'BAD_USER_INPUT',
        { field: 'password' },
      );
    }
    return value;
  }

  private name(value: string | undefined, email: string): string {
    const name = (value || email.split('@')[0]).trim();
    if (name.length < 1 || name.length > 255) {
      throw itemizeGraphqlError('Name must be between 1 and 255 characters', 'BAD_USER_INPUT', {
        field: 'name',
      });
    }
    return name;
  }

  private token(value: string, message = 'Verification token is required'): string {
    if (typeof value !== 'string' || value.length < 1 || value.length > 256) {
      throw itemizeGraphqlError(message, 'BAD_USER_INPUT', {
        field: 'token',
      });
    }
    return value;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
