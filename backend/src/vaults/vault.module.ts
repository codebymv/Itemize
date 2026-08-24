import { Module } from '@nestjs/common';
import { VaultRepository } from './vault.repository';
import { VaultResolver } from './vault.resolver';
import { VaultService } from './vault.service';
import { VaultUnlockRateLimitService } from './vault-unlock-rate-limit.service';

@Module({
  providers: [
    VaultRepository,
    VaultUnlockRateLimitService,
    VaultService,
    VaultResolver,
  ],
})
export class VaultModule {}
