const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourceRoot = path.join(root, 'backend-v2', 'src');
const examplePath = path.join(root, 'backend-v2', '.env.example');

const sourceFiles = [];
const visit = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(target);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      sourceFiles.push(target);
    }
  }
};
visit(sourceRoot);

const used = new Set();
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
    used.add(match[1]);
  }
  for (const match of source.matchAll(/process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g)) {
    used.add(match[1]);
  }
}

const declared = new Set();
for (const line of fs.readFileSync(examplePath, 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*#?\s*([A-Z][A-Z0-9_]*)=/);
  if (match) declared.add(match[1]);
}

const missing = [...used].filter((key) => !declared.has(key)).sort();
if (missing.length > 0) {
  console.error('backend-v2/.env.example is missing runtime variables:');
  for (const key of missing) console.error(`  - ${key}`);
  process.exitCode = 1;
} else {
  console.log(`backend-v2 environment contract covers ${used.size} runtime variables.`);
}
