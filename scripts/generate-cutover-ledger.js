#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repositoryRoot = path.resolve(__dirname, '..');
const frontendRoot = path.join(repositoryRoot, 'frontend', 'src');
const backendTestRoots = [
    path.join(repositoryRoot, 'backend', 'src', '__tests__'),
    path.join(repositoryRoot, 'backend-v2', 'test'),
];
const inventoryPath = path.join(repositoryRoot, '!docs', 'API', 'generated', 'rest-surface.json');
const overridesPath = path.join(repositoryRoot, '!docs', 'API', 'graphql-operation-overrides.json');
const outputDirectory = path.join(repositoryRoot, '!docs', 'API', 'generated');
const jsonOutput = path.join(outputDirectory, 'graphql-cutover-ledger.json');
const markdownOutput = path.join(outputDirectory, 'graphql-cutover-ledger.md');
const checkOnly = process.argv.includes('--check');

const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);
const clientCallPattern = /\b(api|axios)\.(get|post|put|patch|delete)\s*(?:<[^;\n]{1,240}>)?\s*\(\s*(['"`])([^'"`\r\n]+)\3/g;
const fetchCallPattern = /\bfetch\s*\(\s*(['"`])([^'"`\r\n]+)\1/g;
const testCallPattern = /\.(get|post|put|patch|delete)\s*\(\s*(['"`])(\/api(?:\/[^'"`\r\n]*)?)\2/g;

function walkSourceFiles(directory, { excludeTests = false } = {}) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) return walkSourceFiles(absolutePath, { excludeTests });
        if (!entry.isFile() || !sourceExtensions.has(path.extname(entry.name))) return [];
        if (excludeTests && /\.(test|spec)\.[jt]sx?$/.test(entry.name)) return [];
        return [absolutePath];
    });
}

function relativePath(absolutePath) {
    return path.relative(repositoryRoot, absolutePath).replace(/\\/g, '/');
}

function lineNumberAt(contents, offset) {
    return contents.slice(0, offset).split('\n').length;
}

function extractHttpPath(rawPath) {
    const apiIndex = rawPath.indexOf('/api');
    const docsIndex = rawPath.indexOf('/docs');
    const start = apiIndex >= 0 ? apiIndex : docsIndex;
    if (start < 0) return null;

    let extracted = rawPath.slice(start);
    const queryIndex = extracted.indexOf('?');
    if (queryIndex >= 0) extracted = extracted.slice(0, queryIndex);
    extracted = extracted.replace(/\$\{([^}]+)\}/g, (_match, expression) => {
        const identifiers = expression.match(/[A-Za-z_$][\w$]*/g) || ['value'];
        return `:${identifiers[identifiers.length - 1]}`;
    });
    extracted = extracted.replace(/\/{2,}/g, '/');
    return extracted.length > 1 && extracted.endsWith('/') ? extracted.slice(0, -1) : extracted;
}

function canonicalPath(httpPath) {
    return httpPath
        .replace(/:[A-Za-z_$][\w$]*/g, ':*')
        .replace(/\$\{[^}]+\}/g, ':*');
}

function operationKey(method, httpPath) {
    return `${method.toUpperCase()} ${canonicalPath(httpPath)}`;
}

function runtimeExpressionKey({ method, expression, source }) {
    return `${method.toUpperCase()} ${source} ${expression}`;
}

function pathsHaveSameShape(routePath, callPath) {
    const routeSegments = routePath.split('/');
    const callSegments = callPath.split('/');
    if (routeSegments.length !== callSegments.length) return false;
    return routeSegments.every((segment, index) =>
        segment === callSegments[index] ||
        segment.startsWith(':') ||
        segment === '*'
    );
}

function discoverFrontendCalls() {
    const calls = [];
    const unresolved = [];

    for (const file of walkSourceFiles(frontendRoot, { excludeTests: true }).sort()) {
        const contents = fs.readFileSync(file, 'utf8');
        let match;

        clientCallPattern.lastIndex = 0;
        while ((match = clientCallPattern.exec(contents))) {
            const rawPath = match[4];
            const httpPath = extractHttpPath(rawPath);
            if (!httpPath) continue;
            calls.push({
                method: match[2].toUpperCase(),
                path: httpPath,
                rawPath,
                source: relativePath(file),
                line: lineNumberAt(contents, match.index),
                client: match[1],
                literalInterpolation: match[3] !== '`' && rawPath.includes('${'),
            });
        }

        fetchCallPattern.lastIndex = 0;
        while ((match = fetchCallPattern.exec(contents))) {
            const rawPath = match[2];
            const httpPath = extractHttpPath(rawPath);
            if (!httpPath) continue;
            const followingCall = contents.slice(match.index, match.index + 800);
            const methodMatch = followingCall.match(/\bmethod\s*:\s*['"](GET|POST|PUT|PATCH|DELETE)['"]/i);
            calls.push({
                method: (methodMatch?.[1] || 'GET').toUpperCase(),
                path: httpPath,
                rawPath,
                source: relativePath(file),
                line: lineNumberAt(contents, match.index),
                client: 'fetch',
                literalInterpolation: match[1] !== '`' && rawPath.includes('${'),
            });
        }

        const unresolvedPattern = /\b(api|axios)\.(get|post|put|patch|delete)\s*\(\s*([A-Za-z_$][\w$]*)/g;
        while ((match = unresolvedPattern.exec(contents))) {
            unresolved.push({
                method: match[2].toUpperCase(),
                expression: match[3],
                source: relativePath(file),
                line: lineNumberAt(contents, match.index),
            });
        }
    }

    return { calls, unresolved };
}

function discoverBackendTestCalls() {
    const calls = [];
    const testFiles = backendTestRoots.flatMap(root => walkSourceFiles(root));
    for (const file of testFiles.sort()) {
        if (!/(?:\.(?:test|spec)|-spec)\.[jt]sx?$/.test(file)) continue;
        const contents = fs.readFileSync(file, 'utf8');
        let match;
        testCallPattern.lastIndex = 0;
        while ((match = testCallPattern.exec(contents))) {
            calls.push({
                method: match[1].toUpperCase(),
                path: extractHttpPath(match[3]),
                source: relativePath(file),
                line: lineNumberAt(contents, match.index),
            });
        }
    }
    return calls;
}

function recommendedDisposition(method, publicPath) {
    if (!publicPath.startsWith('/api')) {
        return { disposition: 'non-api', reason: 'Application fallback or documentation route, outside the API migration.' };
    }
    if (publicPath === '/api/status') {
        return { disposition: 'retain-http', reason: 'Infrastructure health/status endpoint.' };
    }
    if (
        publicPath === '/api/billing/webhook' ||
        publicPath.startsWith('/api/invoices/webhook/') ||
        publicPath.startsWith('/api/sms-templates/webhook/') ||
        publicPath === '/api/social/webhook' ||
        publicPath.startsWith('/api/webhooks/') ||
        publicPath === '/api/chat-widget/incoming'
    ) {
        return { disposition: 'retain-http', reason: 'Externally invoked webhook/protocol endpoint.' };
    }
    if (/(?:\/callback(?:\/|$)|\/oauth\/callback(?:\/|$))/.test(publicPath)) {
        return { disposition: 'retain-http', reason: 'Browser/provider callback endpoint.' };
    }
    const binaryDownload = method === 'GET' && /\/(?:export|download|pdf|file)(?:\/|$)/.test(publicPath);
    const binaryUpload = method !== 'GET' && method !== 'DELETE' && /\/(?:import|upload|logo)(?:\/|$)/.test(publicPath);
    if (binaryDownload || binaryUpload) {
        return { disposition: 'retain-http', reason: 'Binary upload/download transport.' };
    }
    if (method === 'GET') {
        return { disposition: 'graphql-query', reason: 'Read operation suitable for a GraphQL query pending semantic review.' };
    }
    return { disposition: 'graphql-mutation', reason: 'State-changing operation suitable for a GraphQL mutation pending semantic review.' };
}

function riskLevel(operation) {
    if (operation.disposition === 'non-api') return 'low';
    if (operation.disposition === 'retain-http') return operation.testCallsites.length ? 'medium' : 'high';
    if (operation.consumerCallsites.length && !operation.testCallsites.length) return 'high';
    if (operation.method !== 'GET' && !operation.testCallsites.length) return 'high';
    if (!operation.consumerCallsites.length && !operation.testCallsites.length) return 'unknown';
    return 'medium';
}

function loadOverrides() {
    if (!fs.existsSync(overridesPath)) return { schemaVersion: 1, operations: {} };
    return JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
}

function buildLedger() {
    if (!fs.existsSync(inventoryPath)) {
        throw new Error('REST inventory is missing. Run npm run api:surface first.');
    }
    const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
    const overrides = loadOverrides();
    const frontend = discoverFrontendCalls();
    const testCalls = discoverBackendTestCalls();
    const operationsByKey = new Map();
    const runtimeExpressionOverrides = new Map(
        (overrides.runtimeExpressions || []).map(entry => [runtimeExpressionKey(entry), entry])
    );

    for (const entry of inventory.entries) {
        for (const publicPath of entry.publicPaths) {
            const key = operationKey(entry.method, publicPath);
            if (!operationsByKey.has(key)) {
                operationsByKey.set(key, {
                    id: `${entry.method} ${publicPath}`,
                    key,
                    method: entry.method,
                    path: publicPath,
                    routeSources: [],
                    consumerCallsites: [],
                    testCallsites: [],
                });
            }
            operationsByKey.get(key).routeSources.push({ source: entry.source, line: entry.line });
        }
    }

    function findOperation(method, callPath) {
        const direct = operationsByKey.get(operationKey(method, callPath));
        if (direct) return direct;
        return [...operationsByKey.values()].find(operation =>
            operation.method === method && pathsHaveSameShape(operation.path, callPath)
        );
    }

    const unmatchedConsumerCalls = [];
    for (const call of frontend.calls) {
        const operation = findOperation(call.method, call.path);
        if (operation) operation.consumerCallsites.push(call);
        else unmatchedConsumerCalls.push(call);
    }

    const unmatchedTestCalls = [];
    for (const call of testCalls) {
        const operation = findOperation(call.method, call.path);
        if (operation) operation.testCallsites.push(call);
        else unmatchedTestCalls.push(call);
    }

    const operations = [...operationsByKey.values()].map(operation => {
        const recommendation = recommendedDisposition(operation.method, operation.path);
        const override = overrides.operations?.[operation.id] || {};
        const merged = {
            ...operation,
            recommendedDisposition: recommendation.disposition,
            dispositionReason: override.dispositionReason || recommendation.reason,
            disposition: override.disposition || recommendation.disposition,
            owner: override.owner || null,
            targetOperation: override.targetOperation || null,
            targetModule: override.targetModule || null,
            parityStatus: override.parityStatus || 'not-started',
            notes: override.notes || null,
            literalInterpolationRisk: operation.consumerCallsites.some(call => call.literalInterpolation),
        };
        merged.risk = override.risk || riskLevel(merged);
        return merged;
    }).sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

    const knownIds = new Set(operations.map(operation => operation.id));
    const orphanedOverrides = Object.keys(overrides.operations || {}).filter(id => !knownIds.has(id)).sort();
    const acknowledgedRuntimeFrontendExpressions = frontend.unresolved
        .filter(call => runtimeExpressionOverrides.has(runtimeExpressionKey(call)))
        .map(call => ({
            ...call,
            ...runtimeExpressionOverrides.get(runtimeExpressionKey(call)),
        }));
    const unresolvedFrontendExpressions = frontend.unresolved
        .filter(call => !runtimeExpressionOverrides.has(runtimeExpressionKey(call)));
    const discoveredRuntimeExpressionKeys = new Set(frontend.unresolved.map(runtimeExpressionKey));
    const orphanedRuntimeExpressionOverrides = (overrides.runtimeExpressions || [])
        .filter(entry => !discoveredRuntimeExpressionKeys.has(runtimeExpressionKey(entry)));

    const summary = {
        operationCount: operations.length,
        apiOperationCount: operations.filter(operation => operation.path.startsWith('/api')).length,
        nonApiOperationCount: operations.filter(operation => !operation.path.startsWith('/api')).length,
        frontendCallsiteCount: frontend.calls.length,
        operationsWithFrontendConsumers: operations.filter(operation => operation.consumerCallsites.length).length,
        operationsWithBackendTests: operations.filter(operation => operation.testCallsites.length).length,
        unmatchedFrontendCallCount: unmatchedConsumerCalls.length,
        unresolvedFrontendExpressionCount: unresolvedFrontendExpressions.length,
        acknowledgedRuntimeFrontendExpressionCount: acknowledgedRuntimeFrontendExpressions.length,
        unmatchedBackendTestCallCount: unmatchedTestCalls.length,
        retainHttpCount: operations.filter(operation => operation.disposition === 'retain-http').length,
        graphqlQueryCount: operations.filter(operation => operation.disposition === 'graphql-query').length,
        graphqlMutationCount: operations.filter(operation => operation.disposition === 'graphql-mutation').length,
        highRiskCount: operations.filter(operation => operation.risk === 'high').length,
        literalInterpolationRiskCount: frontend.calls.filter(call => call.literalInterpolation).length,
    };

    return {
        schemaVersion: 1,
        generator: 'scripts/generate-cutover-ledger.js',
        generatedFrom: ['!docs/API/generated/rest-surface.json', '!docs/API/graphql-operation-overrides.json'],
        summary,
        caveats: [
            'Consumer and test matching is static and method/path based; unclassified runtime-computed URLs require manual review.',
            'Parameter names are normalized during matching, so /:id and /:invoiceId are treated as the same shape.',
            'A missing frontend callsite does not prove an endpoint is unused; external, mobile, automation, and stale consumers may exist.',
            'Recommended dispositions are starting points, not approved schema design.',
        ],
        operations,
        unmatchedFrontendCalls: unmatchedConsumerCalls,
        unresolvedFrontendExpressions,
        acknowledgedRuntimeFrontendExpressions,
        unmatchedBackendTestCalls: unmatchedTestCalls,
        orphanedOverrides,
        orphanedRuntimeExpressionOverrides,
    };
}

function renderMarkdown(ledger) {
    const summary = ledger.summary;
    const lines = [
        '# Generated GraphQL cutover ledger',
        '',
        '> Generated by `npm run api:ledger`. Edit `!docs/API/graphql-operation-overrides.json`, not this file.',
        '',
        '## Summary',
        '',
        `- Registered method/path operations: ${summary.operationCount}`,
        `- API operations under \`/api\`: ${summary.apiOperationCount}`,
        `- Non-API registered operations: ${summary.nonApiOperationCount}`,
        `- Static frontend callsites: ${summary.frontendCallsiteCount}`,
        `- Operations with frontend consumers: ${summary.operationsWithFrontendConsumers}`,
        `- Operations referenced by backend tests: ${summary.operationsWithBackendTests}`,
        `- Recommended GraphQL queries: ${summary.graphqlQueryCount}`,
        `- Recommended GraphQL mutations: ${summary.graphqlMutationCount}`,
        `- Recommended retained HTTP endpoints: ${summary.retainHttpCount}`,
        `- High-risk operations: ${summary.highRiskCount}`,
        `- Unmatched frontend calls: ${summary.unmatchedFrontendCallCount}`,
        `- Runtime URL expressions requiring review: ${summary.unresolvedFrontendExpressionCount}`,
        `- Acknowledged generic runtime URL helpers: ${summary.acknowledgedRuntimeFrontendExpressionCount}`,
        `- Literal string interpolation callsites: ${summary.literalInterpolationRiskCount}`,
        '',
        '## Interpretation limits',
        '',
        ...ledger.caveats.map(caveat => `- ${caveat}`),
        '',
        '## Operations',
        '',
        '| Method | REST path | Consumers | Tests | Disposition | Risk | Owner / target |',
        '| --- | --- | ---: | ---: | --- | --- | --- |',
    ];

    for (const operation of ledger.operations) {
        const ownerTarget = [operation.owner, operation.targetModule, operation.targetOperation].filter(Boolean).join(' / ') || '_unassigned_';
        lines.push(
            `| ${operation.method} | \`${operation.path}\` | ${operation.consumerCallsites.length} | ${operation.testCallsites.length} | ${operation.disposition} | ${operation.risk} | ${ownerTarget} |`
        );
    }

    lines.push('', '## Review queues', '');
    lines.push(`- Unmatched frontend calls: ${ledger.unmatchedFrontendCalls.length}`);
    lines.push(`- Runtime URL expressions: ${ledger.unresolvedFrontendExpressions.length}`);
    lines.push(`- Acknowledged generic runtime URL helpers: ${ledger.acknowledgedRuntimeFrontendExpressions.length}`);
    lines.push(`- Unmatched backend test calls: ${ledger.unmatchedBackendTestCalls.length}`);
    lines.push(`- Orphaned manual overrides: ${ledger.orphanedOverrides.length}`);
    lines.push(`- Orphaned runtime-expression overrides: ${ledger.orphanedRuntimeExpressionOverrides.length}`, '');

    lines.push('### Unmatched frontend calls', '');
    lines.push('| Method | Requested path | Source | Review note |');
    lines.push('| --- | --- | --- | --- |');
    for (const call of ledger.unmatchedFrontendCalls) {
        const note = call.literalInterpolation ? 'Literal string contains `${...}`; this is not runtime interpolation.' : 'No matching registered REST operation.';
        lines.push(`| ${call.method} | \`${call.path}\` | \`${call.source}:${call.line}\` | ${note} |`);
    }
    if (!ledger.unmatchedFrontendCalls.length) lines.push('| — | — | — | None |');

    lines.push('', '### Runtime URL expressions', '');
    lines.push('| Method | Expression | Source |');
    lines.push('| --- | --- | --- |');
    for (const call of ledger.unresolvedFrontendExpressions) {
        lines.push(`| ${call.method} | \`${call.expression}\` | \`${call.source}:${call.line}\` |`);
    }
    if (!ledger.unresolvedFrontendExpressions.length) lines.push('| — | — | None |');

    lines.push('', '### Acknowledged generic runtime URL helpers', '');
    lines.push('| Method | Expression | Source | Classification | Note |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const call of ledger.acknowledgedRuntimeFrontendExpressions) {
        lines.push(`| ${call.method} | \`${call.expression}\` | \`${call.source}:${call.line}\` | ${call.classification} | ${call.notes} |`);
    }
    if (!ledger.acknowledgedRuntimeFrontendExpressions.length) {
        lines.push('| none | none | none | none | None |');
    }

    lines.push('', '### Unmatched backend test calls', '');
    lines.push('| Method | Requested path | Source |');
    lines.push('| --- | --- | --- |');
    for (const call of ledger.unmatchedBackendTestCalls) {
        lines.push(`| ${call.method} | \`${call.path}\` | \`${call.source}:${call.line}\` |`);
    }
    if (!ledger.unmatchedBackendTestCalls.length) lines.push('| — | — | None |');
    lines.push('');
    return lines.join('\n');
}

function compareOrWrite(target, expected) {
    if (checkOnly) {
        const actual = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
        if (actual !== expected) {
            console.error(`Out of date: ${relativePath(target)}. Run npm run api:ledger.`);
            process.exitCode = 1;
        }
        return;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, expected);
    console.log(`Wrote ${relativePath(target)}`);
}

function main() {
    const ledger = buildLedger();
    compareOrWrite(jsonOutput, `${JSON.stringify(ledger, null, 2)}\n`);
    compareOrWrite(markdownOutput, renderMarkdown(ledger));

    if (checkOnly && !process.exitCode) {
        console.log(`Cutover ledger is current (${ledger.summary.operationCount} operations).`);
    }
}

if (require.main === module) main();

module.exports = {
    buildLedger,
    canonicalPath,
    extractHttpPath,
    pathsHaveSameShape,
    recommendedDisposition,
};
