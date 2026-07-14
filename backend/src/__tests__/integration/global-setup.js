/**
 * Jest globalSetup — no-op.
 * Each integration test file manages its own TestDbHelper instance
 * with beforeAll/afterAll for setup and cleanup.
 */
module.exports = async () => {};
