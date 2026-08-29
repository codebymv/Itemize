export const AVAILABLE_PLANS_HASH = '#available-plans';
export const AVAILABLE_PLANS_PATH = '/settings?section=plans';

export const isAvailablePlansLocation = (search: string, hash: string): boolean =>
  hash === AVAILABLE_PLANS_HASH || new URLSearchParams(search).get('section') === 'plans';
