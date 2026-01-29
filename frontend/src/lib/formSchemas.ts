import { z } from 'zod';
import { hexColorSchema } from '@/lib/schemas';

export const createListFormSchema = z.object({
  title: z.string().min(1, 'List title is required').max(200, 'List title is too long'),
  category: z.string().optional(),
  color: hexColorSchema.optional().default('#3B82F6'),
});

export type CreateListFormValues = z.infer<typeof createListFormSchema>;

export const createNoteFormSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title is too long'),
  category: z.string().optional(),
  newCategory: z.string().optional(),
  isAddingNewCategory: z.boolean().default(false),
}).superRefine((data, ctx) => {
  if (data.isAddingNewCategory) {
    if (!data.newCategory || !data.newCategory.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['newCategory'],
        message: 'New category is required',
      });
    }
  } else if (!data.category || !data.category.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['category'],
      message: 'Category is required',
    });
  }
});

export type CreateNoteFormValues = z.infer<typeof createNoteFormSchema>;

export const createItemFormSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title is too long'),
  category: z.string().optional(),
  newCategory: z.string().optional(),
  isAddingNewCategory: z.boolean().default(false),
  color: hexColorSchema.optional().default('#3B82F6'),
  categoryColor: hexColorSchema.optional().default('#808080'),
});

export type CreateItemFormValues = z.infer<typeof createItemFormSchema>;
