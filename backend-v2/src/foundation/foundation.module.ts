import { Module } from '@nestjs/common';
import { FoundationResolver } from './foundation.resolver';

@Module({ providers: [FoundationResolver] })
export class FoundationModule {}
