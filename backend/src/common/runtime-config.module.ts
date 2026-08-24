import { Global, Module } from '@nestjs/common';
import { RuntimeConfigValidationService } from './runtime-config';

@Global()
@Module({ providers: [RuntimeConfigValidationService] })
export class RuntimeConfigModule {}
