const SQL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * SQL predicate for background workers that do not have an authenticated
 * request context. Keep this aligned with hasPaidEntitlement().
 */
export const paidEntitlementSql = (organizationAlias = 'organization'): string => {
  if (!SQL_IDENTIFIER.test(organizationAlias)) {
    throw new Error('Unsafe organization SQL alias');
  }

  return `(
    ${organizationAlias}.plan IN ('starter','unlimited','pro')
    AND (
      ${organizationAlias}.subscription_status='active'
      OR (
        ${organizationAlias}.subscription_status='trialing'
        AND ${organizationAlias}.trial_ends_at IS NOT NULL
        AND ${organizationAlias}.trial_ends_at>CURRENT_TIMESTAMP
      )
    )
  )`;
};
