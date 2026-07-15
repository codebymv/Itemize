#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repositoryRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(repositoryRoot, 'backend', 'src');
const outputDirectory = path.join(repositoryRoot, '!docs', 'API', 'generated');
const jsonOutput = path.join(outputDirectory, 'rest-surface.json');
const markdownOutput = path.join(outputDirectory, 'rest-surface.md');
const checkOnly = process.argv.includes('--check');

const routePattern = /\b(router|app)\.(get|post|put|patch|delete|options|head|all)\s*\(\s*(['"`])([^'"`\r\n]+)\3/g;
const requirePattern = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*(['"])([^'"]+)\2\s*\)/g;
const mountPattern = /\b(router|app)\.use\s*\(\s*(?:(['"])([^'"]*)\2\s*,\s*)?([A-Za-z_$][\w$]*)/g;

function walkJavaScriptFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true })
        .flatMap(entry => {
            const absolutePath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === '__tests__') return [];
                return walkJavaScriptFiles(absolutePath);
            }
            return entry.isFile() && entry.name.endsWith('.js') ? [absolutePath] : [];
        });
}

function relativePath(absolutePath) {
    return path.relative(repositoryRoot, absolutePath).replace(/\\/g, '/');
}

function resolveLocalModule(parentFile, request) {
    if (!request.startsWith('.')) return null;
    const base = path.resolve(path.dirname(parentFile), request);
    const candidates = [base, `${base}.js`, path.join(base, 'index.js')];
    return candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

function joinUrlPath(prefix, routePath) {
    if (routePath === '/') return prefix || '/';
    const joined = `${prefix || ''}/${routePath || ''}`.replace(/\/{2,}/g, '/');
    return joined.length > 1 && joined.endsWith('/') ? joined.slice(0, -1) : joined;
}

function lineNumberAt(contents, offset) {
    return contents.slice(0, offset).split('\n').length;
}

function maskComments(contents) {
    const characters = [...contents];
    let state = 'code';

    for (let index = 0; index < characters.length; index += 1) {
        const current = characters[index];
        const next = characters[index + 1];

        if (state === 'line-comment') {
            if (current === '\n') state = 'code';
            else characters[index] = ' ';
            continue;
        }
        if (state === 'block-comment') {
            if (current === '*' && next === '/') {
                characters[index] = ' ';
                characters[index + 1] = ' ';
                index += 1;
                state = 'code';
            } else if (current !== '\n' && current !== '\r') {
                characters[index] = ' ';
            }
            continue;
        }
        if (state !== 'code') {
            if (current === '\\') index += 1;
            else if (
                (state === 'single-quote' && current === "'") ||
                (state === 'double-quote' && current === '"') ||
                (state === 'template' && current === '`')
            ) state = 'code';
            continue;
        }

        if (current === '/' && next === '/') {
            characters[index] = ' ';
            characters[index + 1] = ' ';
            index += 1;
            state = 'line-comment';
        } else if (current === '/' && next === '*') {
            characters[index] = ' ';
            characters[index + 1] = ' ';
            index += 1;
            state = 'block-comment';
        } else if (current === "'") state = 'single-quote';
        else if (current === '"') state = 'double-quote';
        else if (current === '`') state = 'template';
    }

    return characters.join('');
}

function parseFile(absolutePath) {
    const contents = fs.readFileSync(absolutePath, 'utf8');
    const sourceCode = maskComments(contents);
    const requires = new Map();
    let match;

    requirePattern.lastIndex = 0;
    while ((match = requirePattern.exec(sourceCode))) {
        const resolved = resolveLocalModule(absolutePath, match[3]);
        if (resolved) requires.set(match[1], resolved);
    }

    const mounts = [];
    mountPattern.lastIndex = 0;
    while ((match = mountPattern.exec(sourceCode))) {
        const child = requires.get(match[4]);
        if (child) mounts.push({ prefix: match[3] || '', child });
    }

    const routes = [];
    routePattern.lastIndex = 0;
    while ((match = routePattern.exec(sourceCode))) {
        routes.push({
            method: match[2].toUpperCase(),
            declaredPath: match[4],
            dynamic: match[3] === '`' && match[4].includes('${'),
            line: lineNumberAt(contents, match.index),
        });
    }

    return { absolutePath, mounts, routes };
}

function buildMountMap(parsedFiles) {
    const byPath = new Map(parsedFiles.map(file => [file.absolutePath, file]));
    const mounts = new Map();
    const queue = [];

    function seed(file, prefix) {
        if (!byPath.has(file)) return;
        if (!mounts.has(file)) mounts.set(file, new Set());
        if (!mounts.get(file).has(prefix)) {
            mounts.get(file).add(prefix);
            queue.push({ file, prefix });
        }
    }

    seed(path.join(sourceRoot, 'index.js'), '');
    seed(path.join(sourceRoot, 'bootstrap', 'register-api-routes.js'), '');
    seed(path.join(sourceRoot, 'auth.js'), '/api/auth');

    while (queue.length) {
        const current = queue.shift();
        for (const mount of byPath.get(current.file).mounts) {
            seed(mount.child, joinUrlPath(current.prefix, mount.prefix));
        }
    }

    return mounts;
}

function buildInventory() {
    const parsedFiles = walkJavaScriptFiles(sourceRoot).sort().map(parseFile);
    const mountMap = buildMountMap(parsedFiles);
    const entries = parsedFiles.flatMap(file => file.routes.map(route => {
        const prefixes = [...(mountMap.get(file.absolutePath) || [])].sort();
        const publicPaths = route.dynamic
            ? []
            : [...new Set(prefixes.map(prefix => joinUrlPath(prefix, route.declaredPath)))].sort();
        return {
            method: route.method,
            publicPaths,
            declaredPath: route.declaredPath,
            source: relativePath(file.absolutePath),
            line: route.line,
            dynamic: route.dynamic,
        };
    }));

    entries.sort((a, b) =>
        (a.publicPaths[0] || a.declaredPath).localeCompare(b.publicPaths[0] || b.declaredPath) ||
        a.method.localeCompare(b.method) ||
        a.source.localeCompare(b.source) ||
        a.line - b.line
    );

    const resolved = entries.filter(entry => entry.publicPaths.length > 0);
    const unresolved = entries.filter(entry => entry.publicPaths.length === 0);
    const uniqueResolvedOperations = new Set(
        resolved.flatMap(entry => entry.publicPaths.map(publicPath => `${entry.method} ${publicPath}`))
    );

    return {
        schemaVersion: 1,
        generator: 'scripts/generate-api-surface.js',
        scope: 'Static Express route declarations under backend/src, excluding __tests__.',
        summary: {
            declarationCount: entries.length,
            resolvedDeclarationCount: resolved.length,
            unresolvedDeclarationCount: unresolved.length,
            uniqueResolvedOperationCount: uniqueResolvedOperations.size,
            sourceFileCount: new Set(entries.map(entry => entry.source)).size,
        },
        caveats: [
            'This is static source analysis; it does not execute application modules.',
            'Middleware, authorization, request/response schemas, and runtime-conditional registration require separate contract inventory.',
            'A declaration can have multiple public paths when a router is mounted more than once.',
            'Dynamic template-literal paths and routers not reachable from known application entrypoints remain unresolved.',
        ],
        entries,
    };
}

function renderMarkdown(inventory) {
    const { summary } = inventory;
    const lines = [
        '# Generated REST surface baseline',
        '',
        '> Generated by `npm run api:surface`. Do not edit this file by hand.',
        '',
        'This is the source-level endpoint baseline for REST-to-GraphQL cutover tracking. It is intentionally static so inventory generation cannot initialize the app, connect to the database, or invoke external services.',
        '',
        '## Summary',
        '',
        `- Route declarations: ${summary.declarationCount}`,
        `- Resolved declarations: ${summary.resolvedDeclarationCount}`,
        `- Unresolved declarations: ${summary.unresolvedDeclarationCount}`,
        `- Unique resolved method/path operations: ${summary.uniqueResolvedOperationCount}`,
        `- Files containing declarations: ${summary.sourceFileCount}`,
        '',
        '## Interpretation limits',
        '',
        ...inventory.caveats.map(caveat => `- ${caveat}`),
        '',
        '## Operations',
        '',
        '| Method | Public path candidate | Declared path | Source |',
        '| --- | --- | --- | --- |',
    ];

    for (const entry of inventory.entries) {
        const publicPath = entry.publicPaths.length ? entry.publicPaths.join('<br>') : '_unresolved_';
        const declaredPath = entry.dynamic ? `${entry.declaredPath} (dynamic)` : entry.declaredPath;
        lines.push(`| ${entry.method} | \`${publicPath}\` | \`${declaredPath}\` | \`${entry.source}:${entry.line}\` |`);
    }

    lines.push('');
    return lines.join('\n');
}

function compareOrWrite(target, expected) {
    if (checkOnly) {
        const actual = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
        if (actual !== expected) {
            console.error(`Out of date: ${relativePath(target)}. Run npm run api:surface.`);
            process.exitCode = 1;
        }
        return;
    }

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, expected);
    console.log(`Wrote ${relativePath(target)}`);
}

const inventory = buildInventory();
compareOrWrite(jsonOutput, `${JSON.stringify(inventory, null, 2)}\n`);
compareOrWrite(markdownOutput, renderMarkdown(inventory));

if (checkOnly && !process.exitCode) {
    console.log(`REST surface is current (${inventory.summary.declarationCount} declarations).`);
}
