import { Module } from '@nestjs/common';
import { ProductsRepository } from './products.repository';
import { ProductsResolver } from './products.resolver';
import { ProductsService } from './products.service';

@Module({
  providers: [ProductsRepository, ProductsService, ProductsResolver],
  exports: [ProductsService],
})
export class ProductsModule {}
