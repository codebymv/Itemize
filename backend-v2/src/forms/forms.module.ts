import { Module } from '@nestjs/common';
import { FormsRepository } from './forms.repository';
import { FormsResolver } from './forms.resolver';
import { FormsService } from './forms.service';

@Module({
  providers: [FormsRepository, FormsResolver, FormsService],
})
export class FormsModule {}
