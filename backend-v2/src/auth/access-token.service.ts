import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { itemizeGraphqlError } from '../common/graphql-error';

type AccessTokenPayload = {
  id?: unknown;
};

@Injectable()
export class AccessTokenService {
  constructor(private readonly jwtService: JwtService) {}

  async verify(token: string): Promise<{ userId: number }> {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw itemizeGraphqlError(
        'Authentication service is unavailable',
        'SERVICE_UNAVAILABLE',
      );
    }

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        { secret },
      );
      const userId = Number(payload.id);
      if (!Number.isSafeInteger(userId) || userId <= 0) {
        throw new Error('Invalid access-token identity');
      }
      return { userId };
    } catch {
      throw itemizeGraphqlError('Authentication required', 'UNAUTHENTICATED');
    }
  }
}
