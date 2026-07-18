const runCategoryContractMigration = async (pool) => {
  await pool.query(`
    INSERT INTO categories (user_id, name, color_value)
    SELECT id, 'General', '#6B7280'
    FROM users
    ON CONFLICT (user_id, name) DO NOTHING
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION create_general_category_for_user()
    RETURNS TRIGGER AS $$
    BEGIN
      INSERT INTO categories (user_id, name, color_value)
      VALUES (NEW.id, 'General', '#6B7280')
      ON CONFLICT (user_id, name) DO NOTHING;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  await pool.query(`
    DROP TRIGGER IF EXISTS trigger_create_general_category_for_user ON users
  `);
  await pool.query(`
    CREATE TRIGGER trigger_create_general_category_for_user
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION create_general_category_for_user()
  `);

  return true;
};

module.exports = { runCategoryContractMigration };
