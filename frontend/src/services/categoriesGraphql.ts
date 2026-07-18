import type { Category, CreateCategoryPayload } from './api';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

type GraphqlCategory = {
  id: number;
  name: string;
  colorValue: string;
  createdAt: string;
  updatedAt: string;
};

const categoryFields = 'id name colorValue createdAt updatedAt';

const categoriesQuery = `
  query Categories {
    categories { ${categoryFields} }
  }
`;

const createCategoryMutation = `
  mutation CreateCategory($input: CreateCategoryInput!) {
    createCategory(input: $input) { ${categoryFields} }
  }
`;

const updateCategoryMutation = `
  mutation UpdateCategory($id: Int!, $input: UpdateCategoryInput!) {
    updateCategory(id: $id, input: $input) { ${categoryFields} }
  }
`;

const deleteCategoryMutation = `
  mutation DeleteCategory($id: Int!) {
    deleteCategory(id: $id) { deletedId }
  }
`;

const mapCategory = (category: GraphqlCategory): Category => ({
  id: category.id,
  name: category.name,
  color_value: category.colorValue,
  created_at: category.createdAt,
  updated_at: category.updatedAt,
});

const mapInput = (input: CreateCategoryPayload) => ({
  name: input.name,
  ...(input.color_value === undefined
    ? {}
    : { colorValue: input.color_value }),
});

export const getCategoriesViaGraphql = async (): Promise<Category[]> => {
  const data = await graphqlRequest<
    { categories: GraphqlCategory[] },
    Record<string, never>
  >(categoriesQuery, {});
  return data.categories.map(mapCategory);
};

export const createCategoryViaGraphql = async (
  input: CreateCategoryPayload,
): Promise<Category> => {
  const data = await graphqlMutationRequest<
    { createCategory: GraphqlCategory },
    { input: ReturnType<typeof mapInput> }
  >(createCategoryMutation, { input: mapInput(input) });
  return mapCategory(data.createCategory);
};

export const updateCategoryViaGraphql = async (
  id: number,
  input: CreateCategoryPayload,
): Promise<Category> => {
  const data = await graphqlMutationRequest<
    { updateCategory: GraphqlCategory },
    { id: number; input: ReturnType<typeof mapInput> }
  >(updateCategoryMutation, { id, input: mapInput(input) });
  return mapCategory(data.updateCategory);
};

export const deleteCategoryViaGraphql = async (
  id: number,
): Promise<{ deletedId: number }> => {
  const data = await graphqlMutationRequest<
    { deleteCategory: { deletedId: number } },
    { id: number }
  >(deleteCategoryMutation, { id });
  return data.deleteCategory;
};
