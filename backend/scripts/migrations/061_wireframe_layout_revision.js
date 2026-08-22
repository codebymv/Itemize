exports.up = async (pool) => {
    await pool.query(`
        CREATE OR REPLACE FUNCTION update_wireframe_content_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            IF (to_jsonb(NEW) - ARRAY['position_x', 'position_y', 'updated_at'])
               IS DISTINCT FROM
               (to_jsonb(OLD) - ARRAY['position_x', 'position_y', 'updated_at']) THEN
                NEW.updated_at = NOW();
            ELSE
                NEW.updated_at = OLD.updated_at;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trigger_wireframes_updated_at ON wireframes;
        CREATE TRIGGER trigger_wireframes_updated_at
            BEFORE UPDATE ON wireframes
            FOR EACH ROW
            EXECUTE FUNCTION update_wireframe_content_updated_at();
    `);
};

exports.down = async (pool) => {
    await pool.query(`
        DROP TRIGGER IF EXISTS trigger_wireframes_updated_at ON wireframes;
        CREATE TRIGGER trigger_wireframes_updated_at
            BEFORE UPDATE ON wireframes
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
        DROP FUNCTION IF EXISTS update_wireframe_content_updated_at();
    `);
};
