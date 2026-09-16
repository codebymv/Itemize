import { gleamOrganizationAllowed } from './gleam-rollout';
const original = process.env.GLEAM_ALLOWED_ORGANIZATION_IDS;
afterEach(() => {
  if (original === undefined) delete process.env.GLEAM_ALLOWED_ORGANIZATION_IDS;
  else process.env.GLEAM_ALLOWED_ORGANIZATION_IDS = original;
});
it.each(['', ' ', '*', '15,', '15,*', '15,0', '15,01', '15,2147483648', '15,1.5'])('fails closed for %j', value => {
  process.env.GLEAM_ALLOWED_ORGANIZATION_IDS = value;
  expect(gleamOrganizationAllowed(15)).toBe(false);
});
it('matches complete numeric IDs with whitespace and duplicates', () => {
  process.env.GLEAM_ALLOWED_ORGANIZATION_IDS = ' 15,21,15 ';
  expect(gleamOrganizationAllowed(15)).toBe(true);
  expect(gleamOrganizationAllowed(21)).toBe(true);
  expect(gleamOrganizationAllowed(1)).toBe(false);
});
it('denies missing configuration', () => {
  delete process.env.GLEAM_ALLOWED_ORGANIZATION_IDS;
  expect(gleamOrganizationAllowed(15)).toBe(false);
});
