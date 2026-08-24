/**
 * Canonical pipeline-stage identity and compatibility projection.
 *
 * pipeline_stages owns stage identity and ordering. The legacy pipelines.stages
 * JSON array remains writable during the REST-to-GraphQL transition, but
 * database triggers normalize those writes into canonical rows and project
 * direct canonical changes back into the JSON shape consumed by retained code.
 */
async function runCanonicalPipelineStageModelMigration(pool) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
            LOCK TABLE pipelines, pipeline_stages, deals
            IN SHARE ROW EXCLUSIVE MODE
        `);
        await client.query('DROP TRIGGER IF EXISTS pipelines_prepare_canonical_stages ON pipelines');
        await client.query('DROP TRIGGER IF EXISTS pipelines_sync_canonical_stages ON pipelines');
        await client.query('DROP TRIGGER IF EXISTS pipeline_stages_prepare_row ON pipeline_stages');
        await client.query('DROP TRIGGER IF EXISTS pipeline_stages_project_json ON pipeline_stages');
        await client.query(`
            ALTER TABLE deals
            DROP CONSTRAINT IF EXISTS deals_pipeline_organization_fk,
            DROP CONSTRAINT IF EXISTS deals_pipeline_stage_fk
        `);

        await client.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM pipelines p
                    WHERE jsonb_typeof(p.stages) IS DISTINCT FROM 'array'
                ) THEN
                    RAISE EXCEPTION 'Pipeline stages must be a JSON array'
                        USING ERRCODE = '23514';
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM pipelines p
                    CROSS JOIN LATERAL jsonb_array_elements(p.stages) stage
                    WHERE jsonb_typeof(stage) IS DISTINCT FROM 'object'
                       OR NULLIF(btrim(stage->>'id'), '') IS NULL
                       OR NULLIF(btrim(stage->>'name'), '') IS NULL
                       OR length(btrim(stage->>'id')) > 100
                       OR length(btrim(stage->>'name')) > 255
                       OR length(COALESCE(btrim(stage->>'color'), '')) > 50
                ) THEN
                    RAISE EXCEPTION 'Pipeline stages require bounded nonblank id and name values'
                        USING ERRCODE = '23514';
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM pipelines p
                    CROSS JOIN LATERAL jsonb_array_elements(p.stages) stage
                    GROUP BY p.id, btrim(stage->>'id')
                    HAVING count(*) > 1
                ) THEN
                    RAISE EXCEPTION 'Pipeline stage IDs must be unique within a pipeline'
                        USING ERRCODE = '23505';
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM deals d
                    JOIN pipelines p ON p.id = d.pipeline_id
                    WHERE d.organization_id <> p.organization_id
                ) THEN
                    RAISE EXCEPTION 'Deal and pipeline must belong to the same organization'
                        USING ERRCODE = '23514';
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM deals
                    WHERE NULLIF(btrim(stage_id), '') IS NULL
                ) THEN
                    RAISE EXCEPTION 'Deal stage IDs must be nonblank'
                        USING ERRCODE = '23514';
                END IF;
            END
            $$;
        `);

        // Empty legacy pipelines were possible through direct SQL. Give them a
        // deterministic usable stage before making the non-empty rule durable.
        await client.query(`
            UPDATE pipelines
            SET stages = jsonb_build_array(jsonb_build_object(
                'id', 'legacy-lead-' || id::text,
                'name', 'Lead',
                'order', 0,
                'color', '#3B82F6'
            ))
            WHERE jsonb_array_length(stages) = 0
        `);

        // Preserve metadata for a deal-referenced stage that disappeared from
        // the live JSON before discarding the historically stale shadow table.
        await client.query(`
            CREATE TEMP TABLE itemize_pipeline_stage_shadow
            ON COMMIT DROP
            AS
            SELECT *
            FROM pipeline_stages
        `);
        await client.query('DELETE FROM pipeline_stages');

        // The live JSON definition wins for overlapping stage keys. Array
        // position, not a potentially stale order property, defines ordering.
        await client.query(`
            INSERT INTO pipeline_stages (
                pipeline_id,
                stage_key,
                name,
                color,
                probability,
                stage_order,
                is_won_stage,
                is_lost_stage
            )
            SELECT
                p.id,
                btrim(stage.value->>'id'),
                btrim(stage.value->>'name'),
                COALESCE(NULLIF(btrim(stage.value->>'color'), ''), '#3B82F6'),
                CASE
                    WHEN jsonb_typeof(stage.value->'probability') = 'number'
                     AND (stage.value->>'probability') ~ '^[0-9]+$'
                     AND (stage.value->>'probability')::integer BETWEEN 0 AND 100
                        THEN (stage.value->>'probability')::integer
                    ELSE 0
                END,
                (stage.ordinality - 1)::integer,
                CASE
                    WHEN jsonb_typeof(stage.value->'is_won_stage') = 'boolean'
                        THEN (stage.value->>'is_won_stage')::boolean
                    ELSE false
                END,
                CASE
                    WHEN jsonb_typeof(stage.value->'is_lost_stage') = 'boolean'
                        THEN (stage.value->>'is_lost_stage')::boolean
                    ELSE false
                END
            FROM pipelines p
            CROSS JOIN LATERAL jsonb_array_elements(p.stages)
                WITH ORDINALITY AS stage(value, ordinality)
            ORDER BY p.id, stage.ordinality
        `);

        // A deal is stronger evidence than the stale shadow table. Preserve any
        // deal-referenced missing key, using old metadata only when available.
        await client.query(`
            WITH missing AS (
                SELECT DISTINCT
                    d.pipeline_id,
                    btrim(d.stage_id) AS stage_key
                FROM deals d
                LEFT JOIN pipeline_stages ps
                  ON ps.pipeline_id = d.pipeline_id
                 AND ps.stage_key = btrim(d.stage_id)
                WHERE ps.id IS NULL
            ),
            ordered AS (
                SELECT
                    missing.*,
                    row_number() OVER (
                        PARTITION BY missing.pipeline_id
                        ORDER BY missing.stage_key
                    ) - 1 AS missing_order
                FROM missing
            ),
            maxima AS (
                SELECT pipeline_id, COALESCE(max(stage_order) + 1, 0) AS next_order
                FROM pipeline_stages
                GROUP BY pipeline_id
            )
            INSERT INTO pipeline_stages (
                pipeline_id,
                stage_key,
                name,
                color,
                probability,
                stage_order,
                is_won_stage,
                is_lost_stage
            )
            SELECT
                ordered.pipeline_id,
                ordered.stage_key,
                COALESCE(NULLIF(btrim(shadow.name), ''), ordered.stage_key),
                COALESCE(NULLIF(btrim(shadow.color), ''), '#3B82F6'),
                COALESCE(shadow.probability, 0),
                COALESCE(maxima.next_order, 0) + ordered.missing_order,
                COALESCE(shadow.is_won_stage, false),
                COALESCE(shadow.is_lost_stage, false)
            FROM ordered
            LEFT JOIN maxima ON maxima.pipeline_id = ordered.pipeline_id
            LEFT JOIN itemize_pipeline_stage_shadow shadow
              ON shadow.pipeline_id = ordered.pipeline_id
             AND shadow.stage_key = ordered.stage_key
            ORDER BY ordered.pipeline_id, ordered.missing_order
        `);

        // Project the repaired canonical rows back into the exact legacy shape.
        await client.query(`
            UPDATE pipelines p
            SET stages = (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', ps.stage_key,
                        'name', ps.name,
                        'order', ps.stage_order,
                        'color', COALESCE(ps.color, '#3B82F6')
                    )
                    ORDER BY ps.stage_order, ps.id
                )
                FROM pipeline_stages ps
                WHERE ps.pipeline_id = p.id
            )
        `);

        await client.query(`
            ALTER TABLE pipeline_stages
            DROP CONSTRAINT IF EXISTS pipeline_stages_key_not_blank,
            DROP CONSTRAINT IF EXISTS pipeline_stages_name_not_blank,
            DROP CONSTRAINT IF EXISTS pipeline_stages_order_nonnegative,
            DROP CONSTRAINT IF EXISTS pipeline_stages_terminal_exclusive
        `);
        await client.query(`
            ALTER TABLE pipeline_stages
            ADD CONSTRAINT pipeline_stages_key_not_blank
                CHECK (stage_key = btrim(stage_key) AND stage_key <> ''),
            ADD CONSTRAINT pipeline_stages_name_not_blank
                CHECK (name = btrim(name) AND name <> ''),
            ADD CONSTRAINT pipeline_stages_order_nonnegative
                CHECK (stage_order >= 0),
            ADD CONSTRAINT pipeline_stages_terminal_exclusive
                CHECK (NOT (is_won_stage AND is_lost_stage))
        `);
        await client.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline_order_unique
            ON pipeline_stages (pipeline_id, stage_order)
        `);

        // Keep the lowest stable default when historical direct writes left
        // more than one, then make route-independent concurrency impossible.
        await client.query(`
            WITH ranked_defaults AS (
                SELECT
                    id,
                    row_number() OVER (
                        PARTITION BY organization_id
                        ORDER BY id
                    ) AS default_rank
                FROM pipelines
                WHERE is_default = true
            )
            UPDATE pipelines p
            SET is_default = false,
                updated_at = CURRENT_TIMESTAMP
            FROM ranked_defaults ranked
            WHERE p.id = ranked.id
              AND ranked.default_rank > 1
        `);
        await client.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_pipelines_one_default_per_org
            ON pipelines (organization_id)
            WHERE is_default = true
        `);

        await client.query(`
            ALTER TABLE pipelines
            DROP CONSTRAINT IF EXISTS pipelines_id_organization_unique
        `);
        await client.query(`
            ALTER TABLE pipelines
            ADD CONSTRAINT pipelines_id_organization_unique
                UNIQUE (id, organization_id)
        `);
        await client.query(`
            ALTER TABLE deals
            ADD CONSTRAINT deals_pipeline_organization_fk
                FOREIGN KEY (pipeline_id, organization_id)
                REFERENCES pipelines (id, organization_id)
                ON DELETE CASCADE,
            ADD CONSTRAINT deals_pipeline_stage_fk
                FOREIGN KEY (pipeline_id, stage_id)
                REFERENCES pipeline_stages (pipeline_id, stage_key)
                ON DELETE RESTRICT
        `);

        await client.query(`
            CREATE OR REPLACE FUNCTION itemize_prepare_pipeline_stages_json()
            RETURNS trigger
            LANGUAGE plpgsql
            AS $$
            DECLARE
                stage_value jsonb;
                stage_position bigint;
                stage_key text;
                stage_name text;
                stage_color text;
                seen_keys text[] := '{}'::text[];
                normalized_stages jsonb := '[]'::jsonb;
            BEGIN
                IF pg_trigger_depth() > 1 THEN
                    RETURN NEW;
                END IF;

                IF jsonb_typeof(NEW.stages) IS DISTINCT FROM 'array'
                   OR jsonb_array_length(NEW.stages) = 0 THEN
                    RAISE EXCEPTION 'Pipeline stages must be a non-empty array'
                        USING ERRCODE = '23514';
                END IF;

                FOR stage_value, stage_position IN
                    SELECT value, ordinality
                    FROM jsonb_array_elements(NEW.stages)
                        WITH ORDINALITY AS stage(value, ordinality)
                LOOP
                    IF jsonb_typeof(stage_value) IS DISTINCT FROM 'object' THEN
                        RAISE EXCEPTION 'Each pipeline stage must be an object'
                            USING ERRCODE = '23514';
                    END IF;

                    stage_key := btrim(stage_value->>'id');
                    stage_name := btrim(stage_value->>'name');
                    stage_color := COALESCE(
                        NULLIF(btrim(stage_value->>'color'), ''),
                        '#3B82F6'
                    );

                    IF stage_key IS NULL OR stage_key = ''
                       OR stage_name IS NULL OR stage_name = '' THEN
                        RAISE EXCEPTION 'Each pipeline stage requires an id and name'
                            USING ERRCODE = '23514';
                    END IF;
                    IF length(stage_key) > 100
                       OR length(stage_name) > 255
                       OR length(stage_color) > 50 THEN
                        RAISE EXCEPTION 'Pipeline stage values exceed their bounds'
                            USING ERRCODE = '22001';
                    END IF;
                    IF stage_key = ANY(seen_keys) THEN
                        RAISE EXCEPTION 'Pipeline stage IDs must be unique'
                            USING ERRCODE = '23505';
                    END IF;

                    seen_keys := array_append(seen_keys, stage_key);
                    normalized_stages := normalized_stages || jsonb_build_array(
                        jsonb_build_object(
                            'id', stage_key,
                            'name', stage_name,
                            'order', stage_position - 1,
                            'color', stage_color
                        )
                    );
                END LOOP;

                NEW.stages := normalized_stages;
                RETURN NEW;
            END
            $$;
        `);

        await client.query(`
            CREATE OR REPLACE FUNCTION itemize_sync_pipeline_stage_rows()
            RETURNS trigger
            LANGUAGE plpgsql
            AS $$
            BEGIN
                IF pg_trigger_depth() > 1 THEN
                    RETURN NULL;
                END IF;

                PERFORM pg_advisory_xact_lock(
                    hashtext('itemize-pipeline-stages'),
                    NEW.id
                );

                -- Free every current order before applying a reorder/swap.
                UPDATE pipeline_stages
                SET stage_order = stage_order + 1000000
                WHERE pipeline_id = NEW.id;

                INSERT INTO pipeline_stages (
                    pipeline_id,
                    stage_key,
                    name,
                    color,
                    probability,
                    stage_order,
                    is_won_stage,
                    is_lost_stage,
                    updated_at
                )
                SELECT
                    NEW.id,
                    btrim(stage.value->>'id'),
                    btrim(stage.value->>'name'),
                    COALESCE(NULLIF(btrim(stage.value->>'color'), ''), '#3B82F6'),
                    COALESCE(existing.probability, 0),
                    (stage.ordinality - 1)::integer,
                    COALESCE(existing.is_won_stage, false),
                    COALESCE(existing.is_lost_stage, false),
                    CURRENT_TIMESTAMP
                FROM jsonb_array_elements(NEW.stages)
                    WITH ORDINALITY AS stage(value, ordinality)
                LEFT JOIN pipeline_stages existing
                  ON existing.pipeline_id = NEW.id
                 AND existing.stage_key = btrim(stage.value->>'id')
                ORDER BY stage.ordinality
                ON CONFLICT (pipeline_id, stage_key) DO UPDATE SET
                    name = EXCLUDED.name,
                    color = EXCLUDED.color,
                    stage_order = EXCLUDED.stage_order,
                    updated_at = CURRENT_TIMESTAMP;

                DELETE FROM pipeline_stages ps
                WHERE ps.pipeline_id = NEW.id
                  AND NOT EXISTS (
                      SELECT 1
                      FROM jsonb_array_elements(NEW.stages) stage
                      WHERE btrim(stage->>'id') = ps.stage_key
                  );

                RETURN NULL;
            END
            $$;
        `);

        await client.query(`
            CREATE OR REPLACE FUNCTION itemize_prepare_pipeline_stage_row()
            RETURNS trigger
            LANGUAGE plpgsql
            AS $$
            BEGIN
                NEW.stage_key := btrim(NEW.stage_key);
                NEW.name := btrim(NEW.name);
                NEW.color := COALESCE(NULLIF(btrim(NEW.color), ''), '#3B82F6');
                NEW.probability := COALESCE(NEW.probability, 0);
                NEW.is_won_stage := COALESCE(NEW.is_won_stage, false);
                NEW.is_lost_stage := COALESCE(NEW.is_lost_stage, false);

                IF NEW.stage_key = '' OR NEW.name = '' THEN
                    RAISE EXCEPTION 'Pipeline stage id and name are required'
                        USING ERRCODE = '23514';
                END IF;
                IF NEW.stage_order < 0 THEN
                    RAISE EXCEPTION 'Pipeline stage order cannot be negative'
                        USING ERRCODE = '23514';
                END IF;
                IF NEW.is_won_stage AND NEW.is_lost_stage THEN
                    RAISE EXCEPTION 'Pipeline stage cannot be both won and lost'
                        USING ERRCODE = '23514';
                END IF;

                IF TG_OP = 'UPDATE' THEN
                    NEW.updated_at := CURRENT_TIMESTAMP;
                END IF;
                RETURN NEW;
            END
            $$;
        `);

        await client.query(`
            CREATE OR REPLACE FUNCTION itemize_project_pipeline_stage_json()
            RETURNS trigger
            LANGUAGE plpgsql
            AS $$
            DECLARE
                affected_pipeline_id integer;
            BEGIN
                IF pg_trigger_depth() > 1 THEN
                    RETURN NULL;
                END IF;

                FOR affected_pipeline_id IN
                    SELECT DISTINCT pipeline_id
                    FROM unnest(ARRAY[
                        CASE WHEN TG_OP IN ('DELETE', 'UPDATE') THEN OLD.pipeline_id END,
                        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.pipeline_id END
                    ]) pipeline_id
                    WHERE pipeline_id IS NOT NULL
                LOOP
                    IF EXISTS (
                        SELECT 1 FROM pipelines WHERE id = affected_pipeline_id
                    ) AND NOT EXISTS (
                        SELECT 1 FROM pipeline_stages
                        WHERE pipeline_id = affected_pipeline_id
                    ) THEN
                        RAISE EXCEPTION 'A pipeline must retain at least one stage'
                            USING ERRCODE = '23514';
                    END IF;

                    UPDATE pipelines p
                    SET stages = (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'id', ps.stage_key,
                                'name', ps.name,
                                'order', ps.stage_order,
                                'color', COALESCE(ps.color, '#3B82F6')
                            )
                            ORDER BY ps.stage_order, ps.id
                        )
                        FROM pipeline_stages ps
                        WHERE ps.pipeline_id = p.id
                    ),
                    updated_at = CURRENT_TIMESTAMP
                    WHERE p.id = affected_pipeline_id;
                END LOOP;

                RETURN NULL;
            END
            $$;
        `);

        const triggerStatements = [
            `DROP TRIGGER IF EXISTS pipelines_prepare_canonical_stages ON pipelines`,
            `CREATE TRIGGER pipelines_prepare_canonical_stages
                BEFORE INSERT OR UPDATE OF stages ON pipelines
                FOR EACH ROW EXECUTE FUNCTION itemize_prepare_pipeline_stages_json()`,
            `DROP TRIGGER IF EXISTS pipelines_sync_canonical_stages ON pipelines`,
            `CREATE TRIGGER pipelines_sync_canonical_stages
                AFTER INSERT OR UPDATE OF stages ON pipelines
                FOR EACH ROW EXECUTE FUNCTION itemize_sync_pipeline_stage_rows()`,
            `DROP TRIGGER IF EXISTS pipeline_stages_prepare_row ON pipeline_stages`,
            `CREATE TRIGGER pipeline_stages_prepare_row
                BEFORE INSERT OR UPDATE ON pipeline_stages
                FOR EACH ROW EXECUTE FUNCTION itemize_prepare_pipeline_stage_row()`,
            `DROP TRIGGER IF EXISTS pipeline_stages_project_json ON pipeline_stages`,
            `CREATE TRIGGER pipeline_stages_project_json
                AFTER INSERT OR UPDATE OR DELETE ON pipeline_stages
                FOR EACH ROW EXECUTE FUNCTION itemize_project_pipeline_stage_json()`,
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
    runCanonicalPipelineStageModelMigration,
};
