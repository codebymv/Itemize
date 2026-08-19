export const GET_STARTED_MILESTONES = [
  'first_contact',
  'first_list',
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

export const GET_STARTED_STEPS = [
  {
    id: 'workspace_ready',
    href: '/settings',
  },
  {
    id: 'first_contact',
    href: '/contacts',
  },
  {
    id: 'first_list',
    href: '/canvas',
  },
  {
    id: 'first_money',
    href: '/invoices/new',
  },
] as const;
