import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GetStartedModule } from '../get-started/get-started.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ContactTransferGuard } from './contact-transfer.guard';
import { ContactTransfersController } from './contact-transfers.controller';
import { ContactTransfersRepository } from './contact-transfers.repository';
import { ContactTransfersService } from './contact-transfers.service';

@Module({
  imports: [AuthModule, GetStartedModule, OrganizationsModule],
  controllers: [ContactTransfersController],
  providers: [
    ContactTransferGuard,
    ContactTransfersRepository,
    ContactTransfersService,
  ],
})
export class ContactTransfersModule {}
