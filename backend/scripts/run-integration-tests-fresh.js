#!/usr/bin/env node

const path = require('path');
const { spawn } = require('child_process');

const backendRoot = path.resolve(__dirname, '..');
const composeFile = path.join(backendRoot, 'docker-compose.integration.yml');
const port = process.env.ITEMIZE_TEST_DB_PORT || '55432';
const projectName = process.env.ITEMIZE_INTEGRATION_PROJECT || `itemize-integration-${process.pid}`;
const testEnvironment = {
    ...process.env,
    NODE_ENV: 'test',
    ITEMIZE_TEST_DB_PORT: port,
    TEST_DATABASE_URL: `postgresql://itemize_test:itemize_test@127.0.0.1:${port}/itemize_integration`,
    TEST_DATABASE_SSL: 'false',
    JWT_SECRET: process.env.JWT_SECRET || 'docker-integration-test-secret',
};

function run(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: backendRoot,
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
            require.resolve('jest/bin/jest'),
            '--testPathIgnorePatterns=/node_modules/|/dist/',
            '--testMatch=**/src/__tests__/integration/**/*.test.js',
            '--runInBand',
            '--testTimeout=60000',
            '--globalSetup=./src/__tests__/integration/global-setup.js',
            '--globalTeardown=./src/__tests__/integration/global-teardown.js',
        ]);
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
