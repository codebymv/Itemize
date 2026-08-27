import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

type AccountDataExportRow = {
  data: Record<string, unknown>;
};

@Injectable()
export class AccountDataExportRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async exportForUser(userId: number): Promise<Record<string, unknown> | null> {
    const result = await this.pool.query<AccountDataExportRow>(
      `SELECT jsonb_build_object(
         'account',
           jsonb_build_object(
             'id', u.id,
             'email', u.email,
             'name', u.name,
             'provider', u.provider,
             'emailVerified', u.email_verified,
             'role', u.role,
             'createdAt', u.created_at,
             'updatedAt', u.updated_at,
             'defaultOrganizationId', u.default_organization_id,
             'onboardingProgress', u.onboarding_progress
           ),
         'memberships',
           COALESCE((
             SELECT jsonb_agg(
               jsonb_build_object(
                 'organizationId', o.id,
                 'organizationName', o.name,
                 'organizationSlug', o.slug,
                 'role', om.role,
                 'joinedAt', om.joined_at,
                 'isDefault', u.default_organization_id = o.id,
                 'plan', o.plan,
                 'subscriptionStatus', o.subscription_status
               ) ORDER BY om.id
             )
             FROM organization_members om
             JOIN organizations o ON o.id = om.organization_id
             WHERE om.user_id = u.id
           ), '[]'::jsonb),
         'ownedWorkspaceData',
           COALESCE((
             SELECT jsonb_agg(
               jsonb_build_object(
                 'organization', to_jsonb(o) - ARRAY[
                   'stripe_customer_id', 'stripe_subscription_id'
                 ],
                 'contacts', COALESCE((
                   SELECT jsonb_agg(to_jsonb(contact) ORDER BY contact.id)
                   FROM contacts contact WHERE contact.organization_id = o.id
                 ), '[]'::jsonb),
                 'deals', COALESCE((
                   SELECT jsonb_agg(to_jsonb(deal) ORDER BY deal.id)
                   FROM deals deal WHERE deal.organization_id = o.id
                 ), '[]'::jsonb),
                 'invoices', COALESCE((
                   SELECT jsonb_agg(
                     to_jsonb(invoice) - ARRAY[
                       'public_token', 'payment_token', 'stripe_checkout_session_id'
                     ] ORDER BY invoice.id
                   )
                   FROM invoices invoice WHERE invoice.organization_id = o.id
                 ), '[]'::jsonb),
                 'estimates', COALESCE((
                   SELECT jsonb_agg(
                     to_jsonb(estimate) - ARRAY[
                       'public_token', 'accept_token', 'decline_token'
                     ] ORDER BY estimate.id
                   )
                   FROM estimates estimate WHERE estimate.organization_id = o.id
                 ), '[]'::jsonb),
                 'signatureDocuments', COALESCE((
                   SELECT jsonb_agg(
                     to_jsonb(document) - ARRAY[
                       'signing_token', 'access_token', 'file_url', 'signed_file_url'
                     ] ORDER BY document.id
                   )
                   FROM signature_documents document
                   WHERE document.organization_id = o.id
                 ), '[]'::jsonb),
                 'workflows', COALESCE((
                   SELECT jsonb_agg(
                     to_jsonb(workflow) - ARRAY['webhook_secret'] ORDER BY workflow.id
                   )
                   FROM workflows workflow WHERE workflow.organization_id = o.id
                 ), '[]'::jsonb)
               ) ORDER BY owner.id
             )
             FROM organization_members owner
             JOIN organizations o ON o.id = owner.organization_id
             WHERE owner.user_id = u.id AND owner.role = 'owner'
           ), '[]'::jsonb),
         'personalContent', jsonb_build_object(
           'categories', COALESCE((
             SELECT jsonb_agg(to_jsonb(category) - 'user_id' ORDER BY category.id)
             FROM categories category
             WHERE category.user_id = u.id
           ), '[]'::jsonb),
           'lists', COALESCE((
             SELECT jsonb_agg(
               to_jsonb(list) - ARRAY['user_id', 'share_token', 'share_token_hash']
               ORDER BY list.id
             )
             FROM lists list
             WHERE list.user_id = u.id
           ), '[]'::jsonb),
           'notes', COALESCE((
             SELECT jsonb_agg(
               to_jsonb(note) - ARRAY['user_id', 'share_token', 'share_token_hash']
               ORDER BY note.id
             )
             FROM notes note
             WHERE note.user_id = u.id
           ), '[]'::jsonb),
           'whiteboards', COALESCE((
             SELECT jsonb_agg(
               to_jsonb(whiteboard) - ARRAY['user_id', 'share_token', 'share_token_hash']
               ORDER BY whiteboard.id
             )
             FROM whiteboards whiteboard
             WHERE whiteboard.user_id = u.id
           ), '[]'::jsonb),
           'wireframes', COALESCE((
             SELECT jsonb_agg(
               to_jsonb(wireframe) - ARRAY['user_id', 'share_token', 'share_token_hash']
               ORDER BY wireframe.id
             )
             FROM wireframes wireframe
             WHERE wireframe.user_id = u.id
           ), '[]'::jsonb),
           'vaults', COALESCE((
             SELECT jsonb_agg(
               (
                 to_jsonb(vault) - ARRAY[
                   'user_id',
                   'master_password_hash',
                   'share_token',
                   'share_token_hash',
                   'share_snapshot_ciphertext',
                   'share_snapshot_iv'
                 ]
               ) || jsonb_build_object(
                 'items', COALESCE((
                   SELECT jsonb_agg(
                     to_jsonb(item) - 'vault_id'
                     ORDER BY item.order_index, item.id
                   )
                   FROM vault_items item
                   WHERE item.vault_id = vault.id
                 ), '[]'::jsonb)
               )
               ORDER BY vault.id
             )
             FROM vaults vault
             WHERE vault.user_id = u.id
           ), '[]'::jsonb)
         ),
         'retentionDisclosures', jsonb_build_array(
           'Signed-document evidence may be retained when legally or evidentially required.',
           'Payment processors retain transaction records under their own policies.',
           'Security audit events retain a one-way email hash after account deletion.',
           'Encrypted backups expire under Itemize backup-retention controls.'
         )
       ) AS data
       FROM users u
       WHERE u.id = $1`,
      [userId],
    );
    return result.rows[0]?.data ?? null;
  }
}
