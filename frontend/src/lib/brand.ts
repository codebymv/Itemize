/**
 * The Itemize brand blues. These never follow a user's theme colour: they
 * belong to surfaces other people see — marketing, auth, public share and
 * payment pages, invoice and estimate documents, email previews, embedded
 * widgets. Application chrome reads theme tokens instead (`lib/themeColor.ts`);
 * `design-system/brand-surfaces.ts` lists which paths may use these.
 */
/** Tailwind blue-600: the mark, links, and primary buttons in documents and email. */
export const BRAND_BLUE = '#2563eb';
/** Tailwind blue-500: a lighter fill where the 600 reads too heavy (widgets, page themes). */
export const BRAND_BLUE_SOFT = '#3B82F6';
/** Tailwind blue-800: the secondary colour in generated landing pages. */
export const BRAND_BLUE_DEEP = '#1E40AF';
