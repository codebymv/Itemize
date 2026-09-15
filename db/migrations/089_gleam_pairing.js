const { runGleamPairingMigration } = require('../src/db_gleam_pairing_migrations');
exports.up = runGleamPairingMigration;
exports.down = async () => {}; // Retain approval and revocation evidence.
