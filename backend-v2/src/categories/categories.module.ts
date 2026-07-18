import { Module } from '@nestjs/common';
import { CategoriesRepository } from './categories.repository';
import { CategoriesResolver } from './categories.resolver';
import { CategoriesService } from './categories.service';

@Module({
  providers: [CategoriesRepository, CategoriesService, CategoriesResolver],
})
export class CategoriesModule {}
