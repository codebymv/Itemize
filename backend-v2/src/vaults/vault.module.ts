import { Module } from '@nestjs/common';
import { VaultRepository } from './vault.repository';
import { VaultResolver } from './vault.resolver';
import { VaultService } from './vault.service';

@Module({
  providers: [VaultRepository, VaultService, VaultResolver],
})
export class VaultModule {}
