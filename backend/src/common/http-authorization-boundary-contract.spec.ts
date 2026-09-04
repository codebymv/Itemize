import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

type HttpBoundary = 'public' | 'public-resource' | 'capability' | 'provider-webhook' | 'session';

type HttpRoute = {
  file: string;
  line: number;
  name: string;
  verb: string;
  boundary: HttpBoundary | 'unclassified';
  conflictingBoundaries: HttpBoundary[];
  guards: string[];
  verifiesProviderRequest: boolean;
};

const sourceRoot = path.resolve(__dirname, '..');
const HTTP_METHOD_DECORATORS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'Head', 'Options']);
const SESSION_GUARDS = new Set([
  'CalendarOAuthGuard',
  'ContactTransferGuard',
  'InvoiceLogoUploadGuard',
  'InvoicePdfGuard',
  'SessionOrganizationGuard',
  'SignatureFileGuard',
]);
const CSRF_SESSION_GUARDS = new Set([
  'ContactTransferGuard',
  'InvoiceLogoUploadGuard',
  'SignatureFileGuard',
]);

const controllerFiles = (directory: string): string[] => readdirSync(directory)
  .flatMap((entry) => {
    const absolutePath = path.join(directory, entry);
    if (statSync(absolutePath).isDirectory()) return controllerFiles(absolutePath);
    return entry.endsWith('.controller.ts') ? [absolutePath] : [];
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

const guardNames = (node: ts.Node): string[] => decoratorsOf(node).flatMap((decorator) => {
  if (!ts.isCallExpression(decorator.expression)) return [];
  if (decoratorName(decorator) !== 'UseGuards') return [];
  return decorator.expression.arguments.flatMap((argument) =>
    ts.isIdentifier(argument) ? [argument.text] : []);
});

const methodName = (method: ts.MethodDeclaration): string => {
  if (ts.isIdentifier(method.name) || ts.isStringLiteral(method.name)) return method.name.text;
  return method.name.getText();
};

const inspectController = (absolutePath: string): HttpRoute[] => {
  const sourceFile = ts.createSourceFile(
    absolutePath,
    readFileSync(absolutePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const file = path.relative(sourceRoot, absolutePath).replaceAll('\\', '/');
  const routes: HttpRoute[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement)) continue;
    const classDecorators = decoratorNames(statement);
    if (!classDecorators.has('Controller')) continue;
    const classGuards = guardNames(statement);

    for (const member of statement.members) {
      if (!ts.isMethodDeclaration(member)) continue;
      const methodDecorators = decoratorNames(member);
      const verb = [...methodDecorators].find((name) => HTTP_METHOD_DECORATORS.has(name));
      if (!verb) continue;

      const boundaryDecorators = [
        ['public', 'Public'],
        ['public-resource', 'HttpPublicResourceScoped'],
        ['capability', 'HttpCapabilityScoped'],
        ['provider-webhook', 'HttpProviderWebhookScoped'],
        ['session', 'HttpSessionScoped'],
      ] as const;
      const methodBoundaries = boundaryDecorators.filter(([, name]) => methodDecorators.has(name));
      const boundaries = (methodBoundaries.length > 0 ? methodBoundaries : boundaryDecorators
        .filter(([, name]) => classDecorators.has(name)))
        .map(([boundary]) => boundary);
      const position = sourceFile.getLineAndCharacterOfPosition(member.getStart(sourceFile));

      routes.push({
        file,
        line: position.line + 1,
        name: methodName(member),
        verb,
        boundary: boundaries[0] ?? 'unclassified',
        conflictingBoundaries: boundaries.slice(1),
        guards: [...classGuards, ...guardNames(member)],
        verifiesProviderRequest: /(?:\.verify|verify[A-Z][A-Za-z]+)\s*\(/.test(
          member.getText(sourceFile),
        ),
      });
    }
  }
  return routes;
};

describe('HTTP authorization boundary contract', () => {
  const routes = controllerFiles(sourceRoot).flatMap(inspectController);

  it('classifies every route by its authoritative access boundary', () => {
    const problems = routes.flatMap((route) => {
      const location = `${route.file}:${route.line} ${route.verb} ${route.name}`;
      if (route.boundary === 'unclassified') return [`${location} is unclassified`];
      if (route.conflictingBoundaries.length > 0) {
        return [`${location} declares conflicting HTTP access boundaries`];
      }
      return [];
    });

    expect(routes.length).toBeGreaterThan(45);
    expect(problems).toEqual([]);
  });

  it('requires every session route to be backed by an approved session guard', () => {
    const missingGuard = routes
      .filter((route) => route.boundary === 'session')
      .filter((route) => !route.guards.some((guard) => SESSION_GUARDS.has(guard)))
      .map((route) => `${route.file}:${route.line} ${route.verb} ${route.name}`);

    expect(missingGuard).toEqual([]);
  });

  it('requires session-authenticated writes to use a CSRF-enforcing guard', () => {
    const missingCsrfGuard = routes
      .filter((route) => route.boundary === 'session')
      .filter((route) => !['Get', 'Head', 'Options'].includes(route.verb))
      .filter((route) => !route.guards.some((guard) => CSRF_SESSION_GUARDS.has(guard)))
      .map((route) => `${route.file}:${route.line} ${route.verb} ${route.name}`);

    expect(missingCsrfGuard).toEqual([]);
  });

  it('requires every provider webhook route to verify its provider request', () => {
    const missingVerification = routes
      .filter((route) => route.boundary === 'provider-webhook')
      .filter((route) => !route.verifiesProviderRequest)
      .map((route) => `${route.file}:${route.line} ${route.verb} ${route.name}`);

    expect(missingVerification).toEqual([]);
  });
});
