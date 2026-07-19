import type { Product } from './invoicesApi';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

type GraphqlProduct = {
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

const fields = `
  id organizationId name description sku price currency productType
  billingPeriod taxRate taxable isActive createdById createdAt updatedAt
`;

const mapProduct = (product: GraphqlProduct): Product => ({
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
): Promise<Product[]> => {
  const products: Product[] = [];
  let page = 1;
  let hasNextPage = true;
  while (hasNextPage) {
    const data = await graphqlRequest<
      {
        products: {
          nodes: GraphqlProduct[];
          pageInfo: { hasNextPage: boolean };
        };
      },
      {
        filter: { isActive?: boolean; search?: string };
        page: { page: number; pageSize: number };
      }
    >(
      `query Products($filter: ProductFilterInput, $page: PageInput) {
        products(filter: $filter, page: $page) {
          nodes { ${fields} }
          pageInfo { hasNextPage }
        }
      }`,
      {
        filter: {
          ...(filter.is_active === undefined
            ? {}
            : { isActive: filter.is_active }),
          ...(filter.search === undefined ? {} : { search: filter.search }),
        },
        page: { page, pageSize: 100 },
      },
      organizationId,
    );
    products.push(...data.products.nodes.map(mapProduct));
    hasNextPage = data.products.pageInfo.hasNextPage;
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
      createProduct(input: $input) { ${fields} }
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
      updateProduct(id: $id, input: $input) { ${fields} }
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
