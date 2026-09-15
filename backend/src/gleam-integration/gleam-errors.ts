import { HttpException } from '@nestjs/common';

export function gleamError(status: number, code: string): never {
  // Deliberately exclude credential, provider and database error details.
  throw new HttpException({ error: { code } }, status);
}
