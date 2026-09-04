import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

type OperationBoundary = {
  file: string;
  line: number;
  name: string;
  operation: 'Query' | 'Mutation';
  scope: 'public' | 'account' | 'organization' | 'platform-admin' | 'unclassified';
  csrfProtected: boolean;
  adminGuarded: boolean;
  conflictingScopes: string[];
};

const sourceRoot = path.resolve(__dirname, '..');

const resolverFiles = (directory: string): string[] => readdirSync(directory)
  .flatMap((entry) => {
    const absolutePath = path.join(directory, entry);
    if (statSync(absolutePath).isDirectory()) return resolverFiles(absolutePath);
    return entry.endsWith('.resolver.ts') ? [absolutePath] : [];
  });

const decoratorsOf = (node: ts.Node): readonly ts.Decorator[] =>
  ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : [];

const decoratorName = (decorator: ts.Decorator): string | null => {
  const expression = ts.isCallExpression(decorator.expression)
    ? decorator.expression.expression
    : decorator.expression;
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
};

const decoratorNames = (node: ts.Node): Set<string> => new Set(
  decoratorsOf(node).map(decoratorName).filter((name): name is string => name !== null),
);

const usesAdminGuard = (node: ts.Node): boolean => decoratorsOf(node).some((decorator) => {
  if (!ts.isCallExpression(decorator.expression)) return false;
  if (decoratorName(decorator) !== 'UseGuards') return false;
  return decorator.expression.arguments.some(
    (argument) => ts.isIdentifier(argument) && argument.text === 'AdminAccessGuard',
  );
});

const operationName = (method: ts.MethodDeclaration): string => {
  if (ts.isIdentifier(method.name) || ts.isStringLiteral(method.name)) {
    return method.name.text;
  }
  return method.name.getText();
};

const inspectResolver = (absolutePath: string): OperationBoundary[] => {
  const source = readFileSync(absolutePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    absolutePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const relativeFile = path.relative(sourceRoot, absolutePath).replaceAll('\\', '/');
  const operations: OperationBoundary[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement)) continue;
    const classDecorators = decoratorNames(statement);
    if (!classDecorators.has('Resolver')) continue;
    const classAdminGuarded = usesAdminGuard(statement);

    for (const member of statement.members) {
      if (!ts.isMethodDeclaration(member)) continue;
      const methodDecorators = decoratorNames(member);
      const operation = methodDecorators.has('Query')
        ? 'Query'
        : methodDecorators.has('Mutation')
          ? 'Mutation'
          : null;
      if (!operation) continue;

      const isPublic = methodDecorators.has('Public') || classDecorators.has('Public');
      const declaredScopes = [
        ['account', 'AccountScoped'],
        ['organization', 'OrganizationScoped'],
        ['platform-admin', 'PlatformAdminScoped'],
      ] as const;
      const methodScopes = declaredScopes.filter(([, decorator]) =>
        methodDecorators.has(decorator));
      const scopes = (methodScopes.length > 0 ? methodScopes : declaredScopes
        .filter(([, decorator]) => classDecorators.has(decorator)))
        .map(([scope]) => scope);
      const start = sourceFile.getLineAndCharacterOfPosition(member.getStart(sourceFile));

      operations.push({
        file: relativeFile,
        line: start.line + 1,
        name: operationName(member),
        operation,
        scope: isPublic ? 'public' : scopes[0] ?? 'unclassified',
        csrfProtected: methodDecorators.has('CsrfProtected')
          || classDecorators.has('CsrfProtected'),
        adminGuarded: classAdminGuarded || usesAdminGuard(member),
        conflictingScopes: isPublic ? [] : scopes.slice(1),
      });
    }
  }
  return operations;
};

describe('GraphQL authorization boundary contract', () => {
  const operations = resolverFiles(sourceRoot).flatMap(inspectResolver);

  it('classifies every operation by its authoritative access boundary', () => {
    const problems = operations.flatMap((operation) => {
      const location = `${operation.file}:${operation.line} ${operation.name}`;
      if (operation.scope === 'unclassified') return [`${location} is unclassified`];
      if (operation.conflictingScopes.length > 0) {
        return [`${location} declares conflicting authorization scopes`];
      }
      if (operation.scope === 'platform-admin' && !operation.adminGuarded) {
        return [`${location} declares platform-admin scope without AdminAccessGuard`];
      }
      return [];
    });

    expect(operations.length).toBeGreaterThan(250);
    expect(problems).toEqual([]);
  });

  it('requires CSRF protection on every authenticated mutation', () => {
    const missingCsrf = operations
      .filter((operation) => operation.operation === 'Mutation')
      .filter((operation) => operation.scope !== 'public')
      .filter((operation) => !operation.csrfProtected)
      .map((operation) => `${operation.file}:${operation.line} ${operation.name}`);

    expect(missingCsrf).toEqual([]);
  });
});
