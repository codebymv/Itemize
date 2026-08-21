export const GET_STARTED_MILESTONES = [
  'first_contact',
  'first_list',
  'first_workspace_item',
  'first_invoice',
  'first_deal',
] as const;

export type GetStartedMilestoneName = (typeof GET_STARTED_MILESTONES)[number];

export const GET_STARTED_SOURCES = [
  'create_contact',
  'import_csv',
  'create_list',
  'create_invoice',
  'create_deal',
  'live_backfill',
] as const;

export type GetStartedSource = (typeof GET_STARTED_SOURCES)[number];

export const FREE_GET_STARTED_STEPS = [
  { id: 'first_workspace_item', href: '/canvas' },
] as const;

export const BUSINESS_GET_STARTED_STEPS = [
  { id: 'first_contact', href: '/contacts' },
  { id: 'first_artifact', href: '/estimates/new' },
  { id: 'first_send', href: '/estimates' },
] as const;
