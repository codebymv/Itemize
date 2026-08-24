# Itemize.cloud Categories Implementation Overview

## Introduction

Itemize.cloud allows users to create and manage custom categories to organize their lists and notes. This implementation ensures that categories are user-specific and provides a flexible way to tag and filter content.

## Core Category Management

### Data Model

Categories are stored in the `categories` table in the PostgreSQL database. Each category is associated with a `user_id` to ensure user-specific data isolation.

```sql
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color_value VARCHAR(7) DEFAULT '#3B82F6',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name) -- Prevents duplicate category names per user
);
```

### Backend Endpoints

Category operations are handled by the following API endpoints in `backend/src/index.js`:

-   `GET /api/categories`: Retrieve all categories for the authenticated user.
-   `POST /api/categories`: Create a new category.
-   `PUT /api/categories/:id`: Update an existing category.
-   `DELETE /api/categories/:id`: Delete a category. This operation also reassigns associated lists and notes to a 'General' category to prevent data loss.

### Frontend Implementation

Categories are managed through dedicated UI components, allowing users to create, edit, and delete categories. When a category is deleted, the frontend handles the re-assignment of associated lists and notes.

```typescript
// src/features/categories/components/CategoryManager.tsx (Conceptual)
import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

interface Category {
  id: string;
  name: string;
  color_value: string;
}

const CategoryManager: React.FC = () => {
  const queryClient = useQueryClient();

  const { data: categories, isLoading, isError } = useQuery<Category[]>({n
    queryKey: ['categories'],
    queryFn: () => axios.get('/api/categories').then(res => res.data),
  });

  const addCategoryMutation = useMutation({
    mutationFn: (newCategory: { name: string; color_value?: string }) =>
      axios.post('/api/categories', newCategory),
    onSuccess: () => {
      queryClient.invalidateQueries(['categories']);
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: (updatedCategory: Category) =>
      axios.put(`/api/categories/${updatedCategory.id}`, updatedCategory),
    onSuccess: () => {
      queryClient.invalidateQueries(['categories']);
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (categoryId: string) => axios.delete(`/api/categories/${categoryId}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['categories']);
    },
  });

  // ... rendering logic for managing categories
  return (
    <div>
      <h2>Categories</h2>
      {isLoading && <div>Loading categories...</div>}
      {isError && <div>Error loading categories.</div>}
      <ul>
        {categories?.map((category) => (
          <li key={category.id} style={{ color: category.color_value }}>
            {category.name}
            <button onClick={() => deleteCategoryMutation.mutate(category.id)}>Delete</button>
          </li>
        ))}
      </ul>
      <button onClick={() => addCategoryMutation.mutate({ name: 'New Category' })}>Add Category</button>
    </div>
  );
};

export default CategoryManager;
```

## Integration with Lists and Notes

Both the `lists` and `notes` tables have a `category_id` column that references the `categories` table. This allows for a normalized and consistent way to associate content with user-defined categories.

### Reassignment on Deletion

When a category is deleted, any lists or notes previously associated with that category are automatically reassigned to a default 'General' category. This prevents orphaned data and maintains data integrity.

## Future Enhancements

- **Category Ordering**: Allow users to reorder their categories.
- **Category Icons**: Associate icons with categories for better visual identification.
- **Category Sharing**: Enable sharing of categories with other users.
