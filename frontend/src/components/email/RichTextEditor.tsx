// The email editor is shared by operational admin messages and
// organization-owned campaign and automation templates. Keep consumers on
// this domain-neutral path even while the established implementation and its
// custom extensions remain in the admin component directory.
export { RichTextEditor as default, RichTextEditor } from '@/components/admin/RichTextEditor';
