import { List, Note } from '../types';

export interface CategoryInfo {
  name: string;
  listCount: number;
  noteCount: number;
  totalCount: number;
}

export interface CategoryStats {
  categories: CategoryInfo[];
  totalCategories: number;
}

/**
 * Unified Category Service
 * Manages categories across both lists and notes for consistent UX
 */
export class CategoryService {
  /**
   * Extract all unique categories from lists and notes
   */
  static getAllCategories(lists: List[], notes: Note[]): CategoryStats {
    const categoryMap = new Map<string, CategoryInfo>();

    // Process list categories (lists use 'type' field for category)
    lists.forEach(list => {
      // Treat empty/null/undefined categories as "General"
      const category = (list.type && list.type.trim()) ? list.type.trim() : 'General';
      const existing = categoryMap.get(category) || {
        name: category,
        listCount: 0,
        noteCount: 0,
        totalCount: 0
      };
      existing.listCount++;
      existing.totalCount++;
      categoryMap.set(category, existing);
    });

    // Process note categories
    notes.forEach(note => {
      // Treat empty/null/undefined categories as "General"
      const category = (note.category && note.category.trim()) ? note.category.trim() : 'General';
      const existing = categoryMap.get(category) || {
        name: category,
        listCount: 0,
        noteCount: 0,
        totalCount: 0
      };
      existing.noteCount++;
      existing.totalCount++;
      categoryMap.set(category, existing);
    });

    const categories = Array.from(categoryMap.values())
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      categories,
      totalCategories: categories.length
    };
  }

  /**
   * Get just the category names for dropdowns/selectors
   */
  static getCategoryNames(lists: List[], notes: Note[]): string[] {
    const { categories } = this.getAllCategories(lists, notes);
    return categories.map(cat => cat.name);
  }

  /**
   * Filter lists and notes by category
   */
  static filterByCategory(lists: List[], notes: Note[], categoryFilter: string | null) {
    if (!categoryFilter) {
      return { filteredLists: lists, filteredNotes: notes };
    }

    const filteredLists = lists.filter(list => {
      const listCategory = (list.type && list.type.trim()) ? list.type.trim() : 'General';
      return listCategory.toLowerCase() === categoryFilter.toLowerCase();
    });

    const filteredNotes = notes.filter(note => {
      const noteCategory = (note.category && note.category.trim()) ? note.category.trim() : 'General';
      return noteCategory.toLowerCase() === categoryFilter.toLowerCase();
    });

    return { filteredLists, filteredNotes };
  }

  /**
   * Get category suggestions for autocomplete
   */
  static getCategorySuggestions(
    lists: List[], 
    notes: Note[], 
    currentInput: string
  ): string[] {
    const allCategories = this.getCategoryNames(lists, notes);
    
    if (!currentInput.trim()) {
      return allCategories.slice(0, 10); // Show top 10 categories
    }

    const input = currentInput.toLowerCase();
    return allCategories
      .filter(category => category.toLowerCase().includes(input))
      .slice(0, 5); // Show top 5 matches
  }

  /**
   * Validate if a category is already in use
   */
  static isCategoryInUse(lists: List[], notes: Note[], categoryName: string): boolean {
    const normalizedName = categoryName.trim().toLowerCase();
    
    const inLists = lists.some(list => {
      const listCategory = (list.type && list.type.trim()) ? list.type.trim() : 'General';
      return listCategory.toLowerCase() === normalizedName;
    });
    
    const inNotes = notes.some(note => {
      const noteCategory = (note.category && note.category.trim()) ? note.category.trim() : 'General';
      return noteCategory.toLowerCase() === normalizedName;
    });

    return inLists || inNotes;
  }

  /**
   * Get category statistics for UI display
   */
  static getCategoryDisplayText(categoryInfo: CategoryInfo): string {
    const parts = [];
    if (categoryInfo.listCount > 0) {
      parts.push(`${categoryInfo.listCount} list${categoryInfo.listCount === 1 ? '' : 's'}`);
    }
    if (categoryInfo.noteCount > 0) {
      parts.push(`${categoryInfo.noteCount} note${categoryInfo.noteCount === 1 ? '' : 's'}`);
    }
    return parts.join(', ');
  }
} 