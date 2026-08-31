import type { Product } from './invoicesApi';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

export type GraphqlProduct = {
  id: number;
  organizationId: number;
  name: string;
  description: string | null;
  sku: string | null;
  price: string;
  currency: string;
  productType: Product['product_type'];
  billingPeriod: Product['billing_period'] | null;
  taxRate: string;
  taxable: boolean;
  isActive: boolean;
  createdById: number | null;
  createdAt: string;
  updatedAt: string;
};

export const productFields = `
  id organizationId name description sku price currency productType
  billingPeriod taxRate taxable isActive createdById createdAt updatedAt
`;

export const mapProduct = (product: GraphqlProduct): Product => ({
  id: product.id,
  organization_id: product.organizationId,
  name: product.name,
  ...(product.description === null ? {} : { description: product.description }),
  ...(product.sku === null ? {} : { sku: product.sku }),
  price: Number(product.price),
  currency: product.currency,
  product_type: product.productType,
  ...(product.billingPeriod === null
    ? {}
    : { billing_period: product.billingPeriod }),
  tax_rate: Number(product.taxRate),
  taxable: product.taxable,
  is_active: product.isActive,
  ...(product.createdById === null ? {} : { created_by: product.createdById }),
  created_at: product.createdAt,
  updated_at: product.updatedAt,
});

export type ProductStats = {
  total: number;
  active: number;
  inactive: number;
  oneTime: number;
  recurring: number;
};

export type ProductListParams = {
  is_active?: boolean;
  product_type?: Product['product_type'];
  search?: string;
  page?: number;
  limit?: number;
};

export type ProductListResponse = {
  products: Product[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  stats: ProductStats;
};

type ProductPagePayload = {
  nodes: GraphqlProduct[];
  pageInfo: { page: number; pageSize: number; total: number; totalPages: number; hasNextPage: boolean };
  stats: ProductStats;
};

type ProductListCapability = 'unknown' | 'aggregate' | 'legacy';
let productListCapability: ProductListCapability = 'unknown';

const productPageQuery = `query ProductPage($filter: ProductFilterInput, $page: PageInput) {
  products(filter: $filter, page: $page) {
    nodes { ${productFields} }
    pageInfo { page pageSize total totalPages hasNextPage }
    stats { total active inactive oneTime recurring }
  }
}`;

const legacyProductPageQuery = `query ProductPageLegacy(
  $filter: ProductFilterInput,
  $page: PageInput,
  $summaryPage: PageInput
) {
  filtered: products(filter: $filter, page: $page) {
    nodes { ${productFields} }
    pageInfo { page pageSize total totalPages hasNextPage }
  }
  all: products(page: $summaryPage) {
    nodes { productType }
    pageInfo { total }
  }
  active: products(filter: { isActive: true }, page: $summaryPage) { pageInfo { total } }
  inactive: products(filter: { isActive: false }, page: $summaryPage) { pageInfo { total } }
}`;

const missingProductMetadata = (error: unknown): boolean => error instanceof Error
  && error.message.includes('Cannot query field')
  && (error.message.includes('stats') || error.message.includes('productType'));

const responseFromPage = (value: ProductPagePayload): ProductListResponse => ({
  products: value.nodes.map(mapProduct),
  pagination: {
    page: value.pageInfo.page,
    limit: value.pageInfo.pageSize,
    total: value.pageInfo.total,
    totalPages: value.pageInfo.totalPages,
  },
  stats: value.stats,
});

export const getProductPageViaGraphql = async (
  params: ProductListParams = {},
  organizationId?: number,
  signal?: AbortSignal,
): Promise<ProductListResponse> => {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const normalizedSearch = params.search?.trim();
  const filter = {
    ...(params.is_active === undefined ? {} : { isActive: params.is_active }),
    ...(params.product_type === undefined ? {} : { productType: params.product_type }),
    ...(normalizedSearch ? { search: normalizedSearch } : {}),
  };
  const variables = { filter, page: { page, pageSize: limit } };

  if (productListCapability !== 'legacy') {
    try {
      const data = await graphqlRequest<{ products: ProductPagePayload }, typeof variables>(
        productPageQuery,
        variables,
        organizationId,
        signal,
      );
      productListCapability = 'aggregate';
      return responseFromPage(data.products);
    } catch (error) {
      if (productListCapability !== 'unknown' || !missingProductMetadata(error)) throw error;
      productListCapability = 'legacy';
    }
  }

  const legacyFilter = {
    ...(params.is_active === undefined ? {} : { isActive: params.is_active }),
    ...(normalizedSearch ? { search: normalizedSearch } : {}),
  };
  const data = await graphqlRequest<{
    filtered: Omit<ProductPagePayload, 'stats'>;
    all: { nodes: Array<{ productType: Product['product_type'] }>; pageInfo: { total: number } };
    active: { pageInfo: { total: number } };
    inactive: { pageInfo: { total: number } };
  }, { filter: typeof legacyFilter; page: { page: number; pageSize: number }; summaryPage: { page: number; pageSize: number } }>(
    legacyProductPageQuery,
    { filter: legacyFilter, page: variables.page, summaryPage: { page: 1, pageSize: 100 } },
    organizationId,
    signal,
  );
  const legacyNodes = params.product_type === undefined
    ? data.filtered.nodes
    : data.filtered.nodes.filter((product) => product.productType === params.product_type);
  const filteredTotal = params.product_type === undefined
    ? data.filtered.pageInfo.total
    : legacyNodes.length;
  return responseFromPage({
    ...data.filtered,
    nodes: legacyNodes,
    pageInfo: {
      ...data.filtered.pageInfo,
      total: filteredTotal,
      totalPages: filteredTotal === 0 ? 0 : Math.ceil(filteredTotal / data.filtered.pageInfo.pageSize),
      hasNextPage: false,
    },
    stats: {
      total: data.all.pageInfo.total,
      active: data.active.pageInfo.total,
      inactive: data.inactive.pageInfo.total,
      oneTime: data.all.nodes.filter((product) => product.productType === 'one_time').length,
      recurring: data.all.nodes.filter((product) => product.productType === 'recurring').length,
    },
  });
};

export const resetProductListCapability = (): void => {
  productListCapability = 'unknown';
};

const mapCreateInput = (product: Partial<Product>) => {
  const productType = product.product_type ?? 'one_time';
  return {
    name: product.name ?? '',
    price: product.price === undefined ? '' : String(product.price),
    currency: product.currency ?? 'USD',
    productType,
    billingPeriod:
      productType === 'recurring'
        ? (product.billing_period ?? 'monthly')
        : null,
    taxRate: String(product.tax_rate ?? 0),
    taxable: product.taxable ?? true,
    isActive: product.is_active ?? true,
    ...(product.description === undefined
      ? {}
      : { description: product.description }),
    ...(product.sku === undefined ? {} : { sku: product.sku }),
  };
};

const mapUpdateInput = (product: Partial<Product>) => ({
  ...(product.name === undefined ? {} : { name: product.name }),
  ...(product.description === undefined
    ? {}
    : { description: product.description || null }),
  ...(product.sku === undefined ? {} : { sku: product.sku || null }),
  ...(product.price === undefined ? {} : { price: String(product.price) }),
  ...(product.currency === undefined ? {} : { currency: product.currency }),
  ...(product.product_type === undefined
    ? {}
    : { productType: product.product_type }),
  ...(product.billing_period === undefined
    ? {}
    : { billingPeriod: product.billing_period }),
  ...(product.tax_rate === undefined
    ? {}
    : { taxRate: String(product.tax_rate) }),
  ...(product.taxable === undefined ? {} : { taxable: product.taxable }),
  ...(product.is_active === undefined ? {} : { isActive: product.is_active }),
});

export const getProductsViaGraphql = async (
  filter: { is_active?: boolean; search?: string } = {},
  organizationId?: number,
  signal?: AbortSignal,
): Promise<Product[]> => {
  const products: Product[] = [];
  let page = 1;
  let hasNextPage = true;
  while (hasNextPage) {
    const data = await getProductPageViaGraphql({ ...filter, page, limit: 100 }, organizationId, signal);
    products.push(...data.products);
    hasNextPage = page < data.pagination.totalPages;
    page += 1;
  }
  return products;
};

export const createProductViaGraphql = async (
  product: Partial<Product>,
  organizationId?: number,
): Promise<Product> => {
  const data = await graphqlMutationRequest<
    { createProduct: GraphqlProduct },
    { input: ReturnType<typeof mapCreateInput> }
  >(
    `mutation CreateProduct($input: CreateProductInput!) {
      createProduct(input: $input) { ${productFields} }
    }`,
    { input: mapCreateInput(product) },
    organizationId,
  );
  return mapProduct(data.createProduct);
};

export const updateProductViaGraphql = async (
  id: number,
  product: Partial<Product>,
  organizationId?: number,
): Promise<Product> => {
  const data = await graphqlMutationRequest<
    { updateProduct: GraphqlProduct },
    { id: number; input: ReturnType<typeof mapUpdateInput> }
  >(
    `mutation UpdateProduct($id: Int!, $input: UpdateProductInput!) {
      updateProduct(id: $id, input: $input) { ${productFields} }
    }`,
    { id, input: mapUpdateInput(product) },
    organizationId,
  );
  return mapProduct(data.updateProduct);
};

export const deleteProductViaGraphql = async (
  id: number,
  organizationId?: number,
): Promise<{ success: boolean }> => {
  const data = await graphqlMutationRequest<
    { deleteProduct: { deletedId: number; success: boolean } },
    { id: number }
  >(
    `mutation DeleteProduct($id: Int!) {
      deleteProduct(id: $id) { deletedId success }
    }`,
    { id },
    organizationId,
  );
  if (data.deleteProduct.deletedId !== id) {
    throw new Error('GraphQL product delete returned the wrong product');
  }
  return { success: data.deleteProduct.success };
};
