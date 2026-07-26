const {
  runChatWidgetGraphqlMigration,
} = require('../../src/db_chat_widget_graphql_migrations');

exports.up = runChatWidgetGraphqlMigration;

exports.down = async function down(pool) {
  await pool.query('DROP TABLE IF EXISTS chat_agent_message_requests');
};
