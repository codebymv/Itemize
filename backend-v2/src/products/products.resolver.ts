import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CsrfProtected, OrganizationScoped } from '../common/metadata';
import { PageInput } from '../common/pagination';
import { RequestContextService } from '../request-context/request-context.service';
import {
  CreateProductInput,
  ProductFilterInput,
  UpdateProductInput,
} from './product.inputs';
import { DeleteProductResult, Product, ProductPage } from './product.types';
import { ProductsService } from './products.service';

@Resolver(() => Product)
export class ProductsResolver {
  constructor(
    private readonly productsService: ProductsService,
    private readonly requestContext: RequestContextService,
  ) {}

  @OrganizationScoped()
  @Query(() => ProductPage)
  products(
    @Args('filter', { nullable: true }) filter?: ProductFilterInput,
    @Args('page', { nullable: true }) page?: PageInput,
  ): Promise<ProductPage> {
    return this.productsService.list(this.organizationId(), filter, page);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Product)
  createProduct(@Args('input') input: CreateProductInput): Promise<Product> {
    return this.productsService.create(
      this.organizationId(),
      this.userId(),
      input,
    );
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => Product)
  updateProduct(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateProductInput,
  ): Promise<Product> {
    return this.productsService.update(this.organizationId(), id, input);
  }

  @CsrfProtected()
  @OrganizationScoped()
  @Mutation(() => DeleteProductResult)
  deleteProduct(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<DeleteProductResult> {
    return this.productsService.delete(this.organizationId(), id);
  }

  private organizationId(): number {
    const organization = this.requestContext.current().organization;
    if (!organization) {
      throw new Error('Verified organization context is unavailable');
    }
    return organization.organizationId;
  }

  private userId(): number {
    const identity = this.requestContext.current().identity;
    if (!identity) throw new Error('Verified identity context is unavailable');
    return identity.userId;
  }
}
