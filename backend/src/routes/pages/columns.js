const qualify = (columns, alias) => columns.map(column => `${alias}.${column}`).join(', ');

const PAGE_COLUMNS = [
    'id',
    'organization_id',
    'name',
    'description',
    'slug',
    'status',
    'seo_title',
    'seo_description',
    'seo_keywords',
    'og_image',
    'favicon_url',
    'theme',
    'custom_css',
    'custom_js',
    'custom_head',
    'settings',
    'current_version_id',
    'view_count',
    'unique_visitors',
    'published_at',
    'created_by',
    'created_at',
    'updated_at'
];

const PAGE_SECTION_COLUMNS = [
    'id',
    'page_id',
    'organization_id',
    'section_type',
    'name',
    'content',
    'settings',
    'section_order',
    'created_at',
    'updated_at'
];

const PAGE_VERSION_COLUMNS = [
    'id',
    'page_id',
    'version_number',
    'content',
    'description',
    'created_by',
    'published_at',
    'is_current',
    'created_at'
];

const pageColumns = (alias) => alias ? qualify(PAGE_COLUMNS, alias) : PAGE_COLUMNS.join(', ');
const pageSectionColumns = (alias) => alias ? qualify(PAGE_SECTION_COLUMNS, alias) : PAGE_SECTION_COLUMNS.join(', ');
const pageVersionColumns = (alias) => alias ? qualify(PAGE_VERSION_COLUMNS, alias) : PAGE_VERSION_COLUMNS.join(', ');

const PAGE_SECTION_UNNEST_COLUMNS = [
    'page_id',
    'organization_id',
    'section_type',
    'name',
    'content',
    'settings',
    'section_order'
].join(', ');

module.exports = {
    pageColumns,
    pageSectionColumns,
    pageVersionColumns,
    PAGE_SECTION_UNNEST_COLUMNS
};
