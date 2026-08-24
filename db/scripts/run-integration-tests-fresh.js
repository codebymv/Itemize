#!/usr/bin/env node

// Fresh-database integration gate: creates a disposable PostgreSQL
// instance, initializes the complete migration stream, runs the NestJS
// integration suite against it, and removes the database afterward.
// Successor to backend/scripts/run-integration-tests-fresh.js after
// the Express runtime's retirement; the dual-runtime phase is gone
// because the legacy suite is gone.

const path = require('path');
const { spawn } = require('child_process');

const dbRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(dbRoot, '..');
const graphqlRoot = path.resolve(repoRoot, 'backend-v2');
const composeFile = path.join(dbRoot, 'docker-compose.integration.yml');
const port = process.env.ITEMIZE_TEST_DB_PORT || '55432';
const projectName = process.env.ITEMIZE_INTEGRATION_PROJECT || `itemize-integration-${process.pid}`;

const nestJestArgs = process.argv.slice(2);

function buildTestEnvironment(environment = process.env) {
    return {
        ...environment,
        NODE_ENV: 'test',
        ITEMIZE_TEST_DB_PORT: port,
        TEST_DATABASE_URL: `postgresql://itemize_test:itemize_test@127.0.0.1:${port}/itemize_integration`,
        TEST_DATABASE_SSL: 'false',
        JWT_SECRET: environment.JWT_SECRET || 'docker-integration-test-secret',
        // A disposable database must not make non-disposable provider calls merely
        // because the developer's shell loaded production credentials.
        AWS_ACCESS_KEY_ID: '',
        AWS_SECRET_ACCESS_KEY: '',
        AWS_SESSION_TOKEN: '',
        FACEBOOK_APP_SECRET: '',
        FACEBOOK_WEBHOOK_VERIFY_TOKEN: '',
        GEMINI_API_KEY: '',
        GOOGLE_CLIENT_SECRET: '',
        CALENDAR_TOKEN_ENCRYPTION_KEYS: '',
        CALENDAR_TOKEN_ACTIVE_KEY_ID: '',
        MARKETING_CHAT_AI_ENABLED: 'false',
        RESEND_API_KEY: '',
        RESEND_WEBHOOK_SECRET: '',
        SENTRY_DSN: '',
        STRIPE_SECRET_KEY: '',
        STRIPE_WEBHOOK_SECRET: '',
        TWILIO_ACCOUNT_SID: '',
        TWILIO_AUTH_TOKEN: '',
        TWILIO_PHONE_NUMBER: '',
    };
}

const testEnvironment = buildTestEnvironment();

function run(command, args, cwd = dbRoot) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd,
            env: testEnvironment,
            stdio: 'inherit',
            shell: false,
        });
        child.on('error', reject);
        child.on('exit', code => {
            if (code === 0) resolve();
            else reject(new Error(`${command} exited with code ${code}`));
        });
    });
}

function composeArgs(...args) {
    return ['compose', '--project-name', projectName, '--file', composeFile, ...args];
}

async function main() {
    let composeAttempted = false;
    try {
        await run('docker', ['version']);
        composeAttempted = true;
        await run('docker', composeArgs('up', '--detach', '--wait'));
        await run(process.execPath, [
            path.join(__dirname, 'initialize-test-database.js'),
            '--reset',
            '--confirm-reset',
        ]);

        await run(process.execPath, [
            require.resolve('jest/bin/jest', { paths: [graphqlRoot, repoRoot] }),
            '--config=jest.integration.config.cjs',
            '--runInBand',
            ...nestJestArgs,
        ], graphqlRoot);
    } finally {
        if (composeAttempted) {
            await run('docker', composeArgs('down', '--volumes', '--remove-orphans'))
                .catch(error => console.error(`Failed to remove integration database: ${error.message}`));
        }
    }
}

main().catch(error => {
    console.error(`Fresh integration run failed: ${error.message}`);
    process.exitCode = 1;
});
