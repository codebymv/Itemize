/** Itemize-local organization IDs. No wildcard or implicit general release. */
export function gleamOrganizationAllowed(organizationId: number): boolean {
  const ids = (process.env.GLEAM_ALLOWED_ORGANIZATION_IDS || '').split(',').map(id => id.trim());
  if (ids.some(id => !/^[1-9][0-9]*$/.test(id) || Number(id) > 2147483647)) return false;
  return ids.includes(String(organizationId));
}
