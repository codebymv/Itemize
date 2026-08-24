# Itemize.cloud Loading States Implementation Overview

## Introduction

Itemize.cloud provides clear and consistent visual feedback to users during data loading operations. This document outlines the strategies and components used to manage and display loading states across the application, enhancing user experience and perceived performance.

## Core Principles

1.  **Transparency**: Always inform the user that an operation is in progress.
2.  **Responsiveness**: Provide immediate feedback, even for short loading times.
3.  **Consistency**: Use a unified set of loading indicators and patterns throughout the application.
4.  **Perceived Performance**: Utilize techniques like skeleton screens to make loading feel faster.

## Implementation Details

### 1. Data Fetching Loading States (`@tanstack/react-query`)

Itemize.cloud heavily relies on `@tanstack/react-query` for data fetching. This library provides built-in loading states (`isLoading`, `isFetching`, `isPending`) that are leveraged to display appropriate UI feedback.

#### `isLoading` / `isPending`

Indicates that a query is currently fetching data for the first time or has no data in its cache. This is typically used to show a full loading indicator or skeleton screen.

```typescript
// Example: Lists page loading state
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const ListsPage = () => {
  const { data: lists, isLoading, isError } = useQuery({
    queryKey: ['lists'],
    queryFn: () => axios.get('/api/lists').then(res => res.data),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <p>Loading lists...</p> {/* Or a Spinner component */}
      </div>
    );
  }

  if (isError) {
    return <p>Error loading lists.</p>;
  }

  return (
    <div>
      {/* Render lists */}
    </div>
  );
};
```

#### `isFetching`

Indicates that a query is refetching data in the background (e.g., after a mutation, or due to `staleTime`). This can be used to show a subtle loading indicator, like a small spinner next to the data.

### 2. Skeleton Screens

For initial page loads or when fetching large datasets, skeleton screens are used to provide a visual representation of the content structure before the actual data arrives. This reduces perceived loading time and prevents layout shifts.

```typescript
// Conceptual: A skeleton component for a list item
const ListItemSkeleton = () => (
  <div className="animate-pulse space-y-4">
    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
    <div className="h-4 bg-gray-200 rounded"></div>
    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
  </div>
);

// Usage in a list component
{isLoading ? (
  Array.from({ length: 5 }).map((_, i) => <ListItemSkeleton key={i} />)
) : (
  lists.map(list => <ListItem key={list.id} list={list} />)
)}
```

### 3. Spinners and Progress Indicators

For shorter loading times or specific actions (e.g., saving a form, deleting an item), small spinners or progress bars are used to indicate activity.

```typescript
// Conceptual: A simple spinner component
const Spinner = () => (
  <svg className="animate-spin h-5 w-5 text-blue-500" viewBox="0 0 24 24">
    {/* SVG path for spinner */}
  </svg>
);

// Usage in a button
<button disabled={isSaving}>
  {isSaving ? <Spinner /> : 'Save'}
</button>
```

### 4. Mutation Loading States

`@tanstack/react-query` also provides `isPending` (or `isLoading` in older versions) for mutations, allowing UI updates during data submission.

```typescript
// Example: Create list mutation loading state
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

const CreateListForm = () => {
  const queryClient = useQueryClient();
  const createListMutation = useMutation({
    mutationFn: (newList) => axios.post('/api/lists', newList),
    onSuccess: () => {
      queryClient.invalidateQueries(['lists']);
    },
  });

  const handleSubmit = (data) => {
    createListMutation.mutate(data);
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      <button type="submit" disabled={createListMutation.isPending}>
        {createListMutation.isPending ? 'Creating...' : 'Create List'}
      </button>
    </form>
  );
};
```

## Best Practices

-   **Minimize Layout Shifts**: Use skeleton screens or fixed-size containers to prevent content from jumping around once loaded.
-   **Debounce/Throttle**: For rapid user interactions (e.g., search input), debounce API calls to reduce unnecessary loading states.
-   **Error Handling**: Always pair loading states with clear error messages if the operation fails.
-   **Accessibility**: Ensure loading indicators are accessible to screen readers (e.g., using `aria-live` regions).
-   **Performance**: Optimize data fetching and rendering to keep loading times as short as possible.

## Future Enhancements

-   **Progress Bars**: For long-running operations, provide a more granular progress bar.
-   **Optimistic Updates**: Implement optimistic updates for mutations to provide instant UI feedback, even before the server responds.
-   **Global Loading Indicator**: A subtle indicator (e.g., in the header) for background fetching activities.
