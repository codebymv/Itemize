/**
 * Canonical tag identity and compatibility projection.
 *
 * Tag rows provide organization-scoped identity and the contact_tags/deal_tags
 * junctions provide membership. The legacy text arrays remain writable during
 * the REST-to-GraphQL transition, but database triggers normalize those writes
 * into canonical rows/junctions and project direct junction changes back into
 * the arrays.
 */
async function runCanonicalTagModelMigration(pool) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
            LOCK TABLE tags, contacts, deals, contact_tags, deal_tags
            IN SHARE ROW EXCLUSIVE MODE
        `);

        await client.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM (
                        SELECT unnest(COALESCE(tags, '{}'::text[])) AS name FROM contacts
                        UNION ALL
                        SELECT unnest(COALESCE(tags, '{}'::text[])) AS name FROM deals
                    ) values_from_arrays
                    WHERE length(btrim(name)) > 100
                ) THEN
                    RAISE EXCEPTION 'Cannot canonicalize tag values longer than 100 characters'
                        USING ERRCODE = '22001';
                END IF;
            END
            $$;
        `);

        // Remove unusable rows before adding the normalized-name constraint.
        await client.query(`DELETE FROM tags WHERE btrim(name) = ''`);
        await client.query(`UPDATE tags SET name = btrim(name) WHERE name <> btrim(name)`);

        // Repoint case-insensitive duplicates to the lowest stable ID, then
        // remove the duplicate rows.
        await client.query(`
            WITH duplicate_map AS (
                SELECT
                    id AS duplicate_id,
                    min(id) OVER (
                        PARTITION BY organization_id, lower(btrim(name))
                    ) AS canonical_id
                FROM tags
            )
            INSERT INTO contact_tags (contact_id, tag_id, created_at)
            SELECT ct.contact_id, dm.canonical_id, min(ct.created_at)
            FROM contact_tags ct
            JOIN duplicate_map dm ON dm.duplicate_id = ct.tag_id
            WHERE dm.duplicate_id <> dm.canonical_id
            GROUP BY ct.contact_id, dm.canonical_id
            ON CONFLICT (contact_id, tag_id) DO NOTHING
        `);
        await client.query(`
            WITH duplicate_map AS (
                SELECT
                    id AS duplicate_id,
                    min(id) OVER (
                        PARTITION BY organization_id, lower(btrim(name))
                    ) AS canonical_id
                FROM tags
            )
            INSERT INTO deal_tags (deal_id, tag_id, created_at)
            SELECT dt.deal_id, dm.canonical_id, min(dt.created_at)
            FROM deal_tags dt
            JOIN duplicate_map dm ON dm.duplicate_id = dt.tag_id
            WHERE dm.duplicate_id <> dm.canonical_id
            GROUP BY dt.deal_id, dm.canonical_id
            ON CONFLICT (deal_id, tag_id) DO NOTHING
        `);
        await client.query(`
            DELETE FROM tags t
            USING (
                SELECT
                    id,
                    min(id) OVER (
                        PARTITION BY organization_id, lower(btrim(name))
                    ) AS canonical_id
                FROM tags
            ) duplicate_map
            WHERE t.id = duplicate_map.id
              AND duplicate_map.id <> duplicate_map.canonical_id
        `);

        await client.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_org_normalized_name_unique
            ON tags (organization_id, lower(btrim(name)))
        `);
        await client.query(`
            ALTER TABLE tags
            DROP CONSTRAINT IF EXISTS tags_name_not_blank
        `);
        await client.query(`
            ALTER TABLE tags
            ADD CONSTRAINT tags_name_not_blank CHECK (btrim(name) <> '')
        `);

        // Remove impossible cross-tenant membership before treating junctions
        // as authoritative.
        await client.query(`
            DELETE FROM contact_tags ct
            USING contacts c, tags t
            WHERE ct.contact_id = c.id
              AND ct.tag_id = t.id
              AND c.organization_id <> t.organization_id
        `);
        await client.query(`
            DELETE FROM deal_tags dt
            USING deals d, tags t
            WHERE dt.deal_id = d.id
              AND dt.tag_id = t.id
              AND d.organization_id <> t.organization_id
        `);

        // Create one canonical row for every distinct legacy string. Existing
        // tag-row spelling wins; otherwise the first contact/deal occurrence is
        // retained as the display name.
        await client.query(`
            WITH candidates AS (
                SELECT
                    c.organization_id,
                    btrim(value.name) AS name,
                    0 AS source_order,
                    c.id AS entity_id,
                    value.ordinality
                FROM contacts c
                CROSS JOIN LATERAL unnest(COALESCE(c.tags, '{}'::text[]))
                    WITH ORDINALITY AS value(name, ordinality)
                WHERE btrim(value.name) <> ''
                UNION ALL
                SELECT
                    d.organization_id,
                    btrim(value.name) AS name,
                    1 AS source_order,
                    d.id AS entity_id,
                    value.ordinality
                FROM deals d
                CROSS JOIN LATERAL unnest(COALESCE(d.tags, '{}'::text[]))
                    WITH ORDINALITY AS value(name, ordinality)
                WHERE btrim(value.name) <> ''
            ),
            first_spelling AS (
                SELECT DISTINCT ON (organization_id, lower(name))
                    organization_id,
                    name
                FROM candidates
                ORDER BY
                    organization_id,
                    lower(name),
                    source_order,
                    entity_id,
                    ordinality
            )
            INSERT INTO tags (organization_id, name)
            SELECT organization_id, name
            FROM first_spelling
            ON CONFLICT DO NOTHING
        `);

        // Preserve both sides of any historical drift: array-only membership is
        // added to junctions, while junction-only membership is added to the
        // compatibility arrays below.
        await client.query(`
            INSERT INTO contact_tags (contact_id, tag_id)
            SELECT c.id, t.id
            FROM contacts c
            CROSS JOIN LATERAL unnest(COALESCE(c.tags, '{}'::text[])) value(name)
            JOIN tags t
              ON t.organization_id = c.organization_id
             AND lower(btrim(t.name)) = lower(btrim(value.name))
            WHERE btrim(value.name) <> ''
            ON CONFLICT (contact_id, tag_id) DO NOTHING
        `);
        await client.query(`
            INSERT INTO deal_tags (deal_id, tag_id)
            SELECT d.id, t.id
            FROM deals d
            CROSS JOIN LATERAL unnest(COALESCE(d.tags, '{}'::text[])) value(name)
            JOIN tags t
              ON t.organization_id = d.organization_id
             AND lower(btrim(t.name)) = lower(btrim(value.name))
            WHERE btrim(value.name) <> ''
            ON CONFLICT (deal_id, tag_id) DO NOTHING
        `);

        await client.query(`
            UPDATE contacts c
            SET tags = COALESCE((
                SELECT array_agg(ordered.name ORDER BY ordered.source_order, ordered.position)
                FROM (
                    SELECT DISTINCT ON (membership.tag_id)
                        membership.tag_id,
                        membership.name,
                        membership.source_order,
                        membership.position
                    FROM (
                        SELECT
                            t.id AS tag_id,
                            t.name,
                            0 AS source_order,
                            value.ordinality::bigint AS position
                        FROM unnest(COALESCE(c.tags, '{}'::text[]))
                            WITH ORDINALITY AS value(name, ordinality)
                        JOIN tags t
                          ON t.organization_id = c.organization_id
                         AND lower(btrim(t.name)) = lower(btrim(value.name))
                        UNION ALL
                        SELECT
                            t.id,
                            t.name,
                            1,
                            ct.id::bigint
                        FROM contact_tags ct
                        JOIN tags t ON t.id = ct.tag_id
                        WHERE ct.contact_id = c.id
                    ) membership
                    ORDER BY
                        membership.tag_id,
                        membership.source_order,
                        membership.position
                ) ordered
            ), '{}'::text[])
        `);
        await client.query(`
            UPDATE deals d
            SET tags = COALESCE((
                SELECT array_agg(ordered.name ORDER BY ordered.source_order, ordered.position)
                FROM (
                    SELECT DISTINCT ON (membership.tag_id)
                        membership.tag_id,
                        membership.name,
                        membership.source_order,
                        membership.position
                    FROM (
                        SELECT
                            t.id AS tag_id,
                            t.name,
                            0 AS source_order,
                            value.ordinality::bigint AS position
                        FROM unnest(COALESCE(d.tags, '{}'::text[]))
                            WITH ORDINALITY AS value(name, ordinality)
                        JOIN tags t
                          ON t.organization_id = d.organization_id
                         AND lower(btrim(t.name)) = lower(btrim(value.name))
                        UNION ALL
                        SELECT
                            t.id,
                            t.name,
                            1,
                            dt.id::bigint
                        FROM deal_tags dt
                        JOIN tags t ON t.id = dt.tag_id
                        WHERE dt.deal_id = d.id
                    ) membership
                    ORDER BY
                        membership.tag_id,
                        membership.source_order,
                        membership.position
                ) ordered
            ), '{}'::text[])
        `);

        await client.query(`
            CREATE OR REPLACE FUNCTION itemize_prepare_entity_tags()
            RETURNS trigger
            LANGUAGE plpgsql
            AS $$
            DECLARE
                raw_name text;
                normalized_name text;
                canonical_name text;
                normalized_tags text[] := '{}'::text[];
            BEGIN
                IF pg_trigger_depth() > 1 THEN
                    RETURN NEW;
                END IF;

                PERFORM pg_advisory_xact_lock(
                    hashtext('itemize-canonical-tags'),
                    NEW.organization_id
                );

                FOREACH raw_name IN ARRAY COALESCE(NEW.tags, '{}'::text[])
                LOOP
                    normalized_name := btrim(raw_name);
                    IF normalized_name IS NULL OR normalized_name = '' THEN
                        CONTINUE;
                    END IF;
                    IF length(normalized_name) > 100 THEN
                        RAISE EXCEPTION 'Tag values cannot exceed 100 characters'
                            USING ERRCODE = '22001';
                    END IF;

                    SELECT name
                    INTO canonical_name
                    FROM tags
                    WHERE organization_id = NEW.organization_id
                      AND lower(btrim(name)) = lower(normalized_name)
                    ORDER BY id
                    LIMIT 1;

                    IF canonical_name IS NULL THEN
                        INSERT INTO tags (organization_id, name)
                        VALUES (NEW.organization_id, normalized_name)
                        ON CONFLICT DO NOTHING;

                        SELECT name
                        INTO canonical_name
                        FROM tags
                        WHERE organization_id = NEW.organization_id
                          AND lower(btrim(name)) = lower(normalized_name)
                        ORDER BY id
                        LIMIT 1;
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1
                        FROM unnest(normalized_tags) existing(name)
                        WHERE lower(existing.name) = lower(canonical_name)
                    ) THEN
                        normalized_tags := array_append(normalized_tags, canonical_name);
                    END IF;
                END LOOP;

                NEW.tags := normalized_tags;
                RETURN NEW;
            END
            $$;
        `);

        await client.query(`
            CREATE OR REPLACE FUNCTION itemize_sync_entity_tag_junctions()
            RETURNS trigger
            LANGUAGE plpgsql
            AS $$
            BEGIN
                IF pg_trigger_depth() > 1 THEN
                    RETURN NULL;
                END IF;

                IF TG_TABLE_NAME = 'contacts' THEN
                    DELETE FROM contact_tags WHERE contact_id = NEW.id;
                    INSERT INTO contact_tags (contact_id, tag_id)
                    SELECT NEW.id, t.id
                    FROM unnest(COALESCE(NEW.tags, '{}'::text[]))
                        WITH ORDINALITY value(name, ordinality)
                    JOIN tags t
                      ON t.organization_id = NEW.organization_id
                     AND lower(btrim(t.name)) = lower(btrim(value.name))
                    ORDER BY value.ordinality
                    ON CONFLICT (contact_id, tag_id) DO NOTHING;
                ELSE
                    DELETE FROM deal_tags WHERE deal_id = NEW.id;
                    INSERT INTO deal_tags (deal_id, tag_id)
                    SELECT NEW.id, t.id
                    FROM unnest(COALESCE(NEW.tags, '{}'::text[]))
                        WITH ORDINALITY value(name, ordinality)
                    JOIN tags t
                      ON t.organization_id = NEW.organization_id
                     AND lower(btrim(t.name)) = lower(btrim(value.name))
                    ORDER BY value.ordinality
                    ON CONFLICT (deal_id, tag_id) DO NOTHING;
                END IF;

                RETURN NULL;
            END
            $$;
        `);

        await client.query(`
            CREATE OR REPLACE FUNCTION itemize_validate_tag_membership_tenant()
            RETURNS trigger
            LANGUAGE plpgsql
            AS $$
            DECLARE
                entity_organization_id integer;
                tag_organization_id integer;
            BEGIN
                SELECT organization_id INTO tag_organization_id
                FROM tags WHERE id = NEW.tag_id;

                IF TG_TABLE_NAME = 'contact_tags' THEN
                    SELECT organization_id INTO entity_organization_id
                    FROM contacts WHERE id = NEW.contact_id;
                ELSE
                    SELECT organization_id INTO entity_organization_id
                    FROM deals WHERE id = NEW.deal_id;
                END IF;

                IF entity_organization_id IS DISTINCT FROM tag_organization_id THEN
                    RAISE EXCEPTION 'Tag membership must remain within one organization'
                        USING ERRCODE = '23514';
                END IF;

                RETURN NEW;
            END
            $$;
        `);

        await client.query(`
            CREATE OR REPLACE FUNCTION itemize_project_tag_membership()
            RETURNS trigger
            LANGUAGE plpgsql
            AS $$
            DECLARE
                old_entity_id integer;
                new_entity_id integer;
            BEGIN
                IF pg_trigger_depth() > 1 THEN
                    RETURN NULL;
                END IF;

                IF TG_TABLE_NAME = 'contact_tags' THEN
                    old_entity_id := CASE WHEN TG_OP IN ('DELETE', 'UPDATE') THEN OLD.contact_id END;
                    new_entity_id := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.contact_id END;

                    UPDATE contacts c
                    SET tags = COALESCE((
                        SELECT array_agg(t.name ORDER BY ct.created_at, ct.id)
                        FROM contact_tags ct
                        JOIN tags t ON t.id = ct.tag_id
                        WHERE ct.contact_id = c.id
                    ), '{}'::text[])
                    WHERE c.id IN (
                        SELECT id
                        FROM unnest(ARRAY[old_entity_id, new_entity_id]) id
                        WHERE id IS NOT NULL
                    );
                ELSE
                    old_entity_id := CASE WHEN TG_OP IN ('DELETE', 'UPDATE') THEN OLD.deal_id END;
                    new_entity_id := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.deal_id END;

                    UPDATE deals d
                    SET tags = COALESCE((
                        SELECT array_agg(t.name ORDER BY dt.created_at, dt.id)
                        FROM deal_tags dt
                        JOIN tags t ON t.id = dt.tag_id
                        WHERE dt.deal_id = d.id
                    ), '{}'::text[])
                    WHERE d.id IN (
                        SELECT id
                        FROM unnest(ARRAY[old_entity_id, new_entity_id]) id
                        WHERE id IS NOT NULL
                    );
                END IF;

                RETURN NULL;
            END
            $$;
        `);

        await client.query(`
            CREATE OR REPLACE FUNCTION itemize_prepare_tag_name()
            RETURNS trigger
            LANGUAGE plpgsql
            AS $$
            BEGIN
                NEW.name := btrim(NEW.name);
                IF NEW.name = '' THEN
                    RAISE EXCEPTION 'Tag name is required' USING ERRCODE = '23514';
                END IF;
                RETURN NEW;
            END
            $$;
        `);

        await client.query(`
            CREATE OR REPLACE FUNCTION itemize_project_tag_change()
            RETURNS trigger
            LANGUAGE plpgsql
            AS $$
            BEGIN
                IF TG_OP = 'UPDATE' AND NEW.name IS DISTINCT FROM OLD.name THEN
                    UPDATE contacts c
                    SET tags = ARRAY(
                        SELECT CASE
                            WHEN lower(btrim(value.name)) = lower(btrim(OLD.name))
                                THEN NEW.name
                            ELSE value.name
                        END
                        FROM unnest(COALESCE(c.tags, '{}'::text[]))
                            WITH ORDINALITY value(name, ordinality)
                        ORDER BY value.ordinality
                    )
                    WHERE c.organization_id = OLD.organization_id
                      AND EXISTS (
                          SELECT 1 FROM contact_tags ct
                          WHERE ct.contact_id = c.id AND ct.tag_id = OLD.id
                      );

                    UPDATE deals d
                    SET tags = ARRAY(
                        SELECT CASE
                            WHEN lower(btrim(value.name)) = lower(btrim(OLD.name))
                                THEN NEW.name
                            ELSE value.name
                        END
                        FROM unnest(COALESCE(d.tags, '{}'::text[]))
                            WITH ORDINALITY value(name, ordinality)
                        ORDER BY value.ordinality
                    )
                    WHERE d.organization_id = OLD.organization_id
                      AND EXISTS (
                          SELECT 1 FROM deal_tags dt
                          WHERE dt.deal_id = d.id AND dt.tag_id = OLD.id
                      );
                ELSIF TG_OP = 'DELETE' THEN
                    -- Organization deletion cascades through tags and entities.
                    -- There is no compatibility projection to preserve once the
                    -- owning tenant row is already being removed.
                    IF NOT EXISTS (
                        SELECT 1 FROM organizations
                        WHERE id = OLD.organization_id
                    ) THEN
                        RETURN OLD;
                    END IF;

                    UPDATE contacts c
                    SET tags = ARRAY(
                        SELECT value.name
                        FROM unnest(COALESCE(c.tags, '{}'::text[]))
                            WITH ORDINALITY value(name, ordinality)
                        WHERE lower(btrim(value.name)) <> lower(btrim(OLD.name))
                        ORDER BY value.ordinality
                    )
                    WHERE c.organization_id = OLD.organization_id
                      AND EXISTS (
                          SELECT 1 FROM contact_tags ct
                          WHERE ct.contact_id = c.id AND ct.tag_id = OLD.id
                      );

                    UPDATE deals d
                    SET tags = ARRAY(
                        SELECT value.name
                        FROM unnest(COALESCE(d.tags, '{}'::text[]))
                            WITH ORDINALITY value(name, ordinality)
                        WHERE lower(btrim(value.name)) <> lower(btrim(OLD.name))
                        ORDER BY value.ordinality
                    )
                    WHERE d.organization_id = OLD.organization_id
                      AND EXISTS (
                          SELECT 1 FROM deal_tags dt
                          WHERE dt.deal_id = d.id AND dt.tag_id = OLD.id
                      );
                END IF;

                IF TG_OP = 'DELETE' THEN
                    RETURN OLD;
                END IF;
                RETURN NEW;
            END
            $$;
        `);

        const triggerStatements = [
            `DROP TRIGGER IF EXISTS contacts_prepare_canonical_tags ON contacts`,
            `CREATE TRIGGER contacts_prepare_canonical_tags
                BEFORE INSERT OR UPDATE OF tags, organization_id ON contacts
                FOR EACH ROW EXECUTE FUNCTION itemize_prepare_entity_tags()`,
            `DROP TRIGGER IF EXISTS contacts_sync_canonical_tags ON contacts`,
            `CREATE TRIGGER contacts_sync_canonical_tags
                AFTER INSERT OR UPDATE OF tags, organization_id ON contacts
                FOR EACH ROW EXECUTE FUNCTION itemize_sync_entity_tag_junctions()`,
            `DROP TRIGGER IF EXISTS deals_prepare_canonical_tags ON deals`,
            `CREATE TRIGGER deals_prepare_canonical_tags
                BEFORE INSERT OR UPDATE OF tags, organization_id ON deals
                FOR EACH ROW EXECUTE FUNCTION itemize_prepare_entity_tags()`,
            `DROP TRIGGER IF EXISTS deals_sync_canonical_tags ON deals`,
            `CREATE TRIGGER deals_sync_canonical_tags
                AFTER INSERT OR UPDATE OF tags, organization_id ON deals
                FOR EACH ROW EXECUTE FUNCTION itemize_sync_entity_tag_junctions()`,
            `DROP TRIGGER IF EXISTS contact_tags_validate_tenant ON contact_tags`,
            `CREATE TRIGGER contact_tags_validate_tenant
                BEFORE INSERT OR UPDATE ON contact_tags
                FOR EACH ROW EXECUTE FUNCTION itemize_validate_tag_membership_tenant()`,
            `DROP TRIGGER IF EXISTS deal_tags_validate_tenant ON deal_tags`,
            `CREATE TRIGGER deal_tags_validate_tenant
                BEFORE INSERT OR UPDATE ON deal_tags
                FOR EACH ROW EXECUTE FUNCTION itemize_validate_tag_membership_tenant()`,
            `DROP TRIGGER IF EXISTS contact_tags_project_array ON contact_tags`,
            `CREATE TRIGGER contact_tags_project_array
                AFTER INSERT OR UPDATE OR DELETE ON contact_tags
                FOR EACH ROW EXECUTE FUNCTION itemize_project_tag_membership()`,
            `DROP TRIGGER IF EXISTS deal_tags_project_array ON deal_tags`,
            `CREATE TRIGGER deal_tags_project_array
                AFTER INSERT OR UPDATE OR DELETE ON deal_tags
                FOR EACH ROW EXECUTE FUNCTION itemize_project_tag_membership()`,
            `DROP TRIGGER IF EXISTS tags_prepare_name ON tags`,
            `CREATE TRIGGER tags_prepare_name
                BEFORE INSERT OR UPDATE OF name ON tags
                FOR EACH ROW EXECUTE FUNCTION itemize_prepare_tag_name()`,
            `DROP TRIGGER IF EXISTS tags_project_rename ON tags`,
            `CREATE TRIGGER tags_project_rename
                AFTER UPDATE OF name ON tags
                FOR EACH ROW EXECUTE FUNCTION itemize_project_tag_change()`,
            `DROP TRIGGER IF EXISTS tags_project_delete ON tags`,
            `CREATE TRIGGER tags_project_delete
                BEFORE DELETE ON tags
                FOR EACH ROW EXECUTE FUNCTION itemize_project_tag_change()`,
        ];
        for (const statement of triggerStatements) {
            await client.query(statement);
        }

        await client.query('COMMIT');
        return true;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    runCanonicalTagModelMigration,
};
