import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected } from '../common/metadata';
import { RequestContextService } from '../request-context/request-context.service';
import { CreateCategoryInput, UpdateCategoryInput } from './category.inputs';
import { Category, DeleteCategoryResult } from './category.types';
import { CategoriesService } from './categories.service';

@Resolver(() => Category)
export class CategoriesResolver {
  constructor(
    private readonly categories: CategoriesService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Query(() => [Category], { name: 'categories' })
  categoriesList(): Promise<Category[]> {
    return this.categories.list(this.userId());
  }

  @CsrfProtected()
  @Mutation(() => Category)
  createCategory(@Args('input') input: CreateCategoryInput): Promise<Category> {
    return this.categories.create(this.userId(), input);
  }

  @CsrfProtected()
  @Mutation(() => Category)
  updateCategory(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateCategoryInput,
  ): Promise<Category> {
    return this.categories.update(this.userId(), id, input);
  }

  @CsrfProtected()
  @Mutation(() => DeleteCategoryResult)
  async deleteCategory(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<DeleteCategoryResult> {
    return { deletedId: await this.categories.delete(this.userId(), id) };
  }

  private userId(): number {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified user identity is unavailable');
    return identity.userId;
  }
}
