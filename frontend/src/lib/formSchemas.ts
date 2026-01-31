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

export const createContactFormSchema = z.object({
  first_name: z.string().min(1, 'First name is required').max(100, 'First name is too long').optional(),
  last_name: z.string().min(1, 'Last name is required').max(100, 'Last name is too long').optional(),
  email: z.string().email('Invalid email address').max(255, 'Email is too long').optional(),
  phone: z.string().min(10, 'Phone number is too short').max(20, 'Phone number is too long').optional(),
  company: z.string().max(200, 'Company name is too long').optional(),
  job_title: z.string().max(100, 'Job title is too long').optional(),
  status: z.enum(['active', 'inactive', 'archived']).default('active'),
  source: z.enum(['manual', 'import', 'form', 'integration', 'api']).default('manual'),
}).superRefine((data, ctx) => {
  if (!data.first_name && !data.last_name && !data.email && !data.company) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [],
      message: 'Please provide at least a first name, last name, email, or company',
    });
  }
  return data;
});

export type CreateContactFormValues = z.infer<typeof createContactFormSchema>;

export const createDealFormSchema = z.object({
  title: z.string().min(1, 'Deal title is required').max(200, 'Deal title is too long'),
  value: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Value must be a number').optional(),
  stage_id: z.string().min(1, 'Stage is required'),
  contact_id: z.string().optional(),
  probability: z.string().regex(/^\d{0,3}$/, 'Probability must be 0-100').default('0'),
  expected_close_date: z.string().optional(),
});

export type CreateDealFormValues = z.infer<typeof createDealFormSchema>;
