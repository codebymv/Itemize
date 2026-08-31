import 'reflect-metadata';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import { parse, validate } from 'graphql';
import ts from 'typescript';
import { AppModule } from '../app.module';
import { PG_POOL } from '../database/database.module';

type ConsumerOperation = {
  file: string;
  line: number;
  document: string;
};

const GRAPHQL_CLIENT_FUNCTIONS = new Set([
  'graphqlMutationRequest',
  'graphqlPublicRequest',
  'graphqlRequest',
]);

const looksLikeGraphqlDocument = (value: string): boolean =>
  /^\s*(?:query|mutation|subscription)\b[\s\S]*\{/.test(value);

const frontendSourceDirectory = path.resolve(
  __dirname,
  '../../../frontend/src',
);

const sourceFiles = (directory: string): string[] => readdirSync(directory)
  .flatMap((entry) => {
    const absolutePath = path.join(directory, entry);
    if (statSync(absolutePath).isDirectory()) return sourceFiles(absolutePath);
    if (!/\.(?:ts|tsx)$/.test(entry)) return [];
    if (/\.(?:spec|test)\.(?:ts|tsx)$/.test(entry) || entry.endsWith('.d.ts')) {
      return [];
    }
    return [absolutePath];
  });

const unwrapExpression = (expression: ts.Expression): ts.Expression => {
  if (
    ts.isAsExpression(expression)
    || ts.isParenthesizedExpression(expression)
    || ts.isNonNullExpression(expression)
    || ts.isTypeAssertionExpression(expression)
  ) {
    return unwrapExpression(expression.expression);
  }
  return expression;
};

const callName = (expression: ts.LeftHandSideExpression): string | null => {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
};

const isFunctionParameterReference = (
  call: ts.CallExpression,
  expression: ts.Expression,
): boolean => {
  const unwrapped = unwrapExpression(expression);
  if (!ts.isIdentifier(unwrapped)) return false;
  let current: ts.Node | undefined = call.parent;
  while (current) {
    if (
      ts.isArrowFunction(current)
      || ts.isFunctionDeclaration(current)
      || ts.isFunctionExpression(current)
      || ts.isMethodDeclaration(current)
    ) {
      if (current.parameters.some(
        (parameter) => ts.isIdentifier(parameter.name)
          && parameter.name.text === unwrapped.text,
      )) return true;
    }
    current = current.parent;
  }
  return false;
};

const isFunctionParameterCall = (
  call: ts.CallExpression,
  expression: ts.Expression,
): boolean => {
  const unwrapped = unwrapExpression(expression);
  return ts.isCallExpression(unwrapped)
    && isFunctionParameterReference(call, unwrapped.expression);
};

const extractConsumerOperations = (
  absolutePath: string,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): ConsumerOperation[] => {
  type Bindings = ReadonlyMap<string, ts.Expression>;

  const resolveBoolean = (
    originalExpression: ts.Expression,
    bindings: Bindings,
  ): boolean | null => {
    const expression = unwrapExpression(originalExpression);
    if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (ts.isIdentifier(expression) && bindings.has(expression.text)) {
      return resolveBoolean(bindings.get(expression.text)!, bindings);
    }
    if (
      ts.isPrefixUnaryExpression(expression)
      && expression.operator === ts.SyntaxKind.ExclamationToken
    ) {
      const value = resolveBoolean(expression.operand, bindings);
      return value === null ? null : !value;
    }
    return null;
  };

  const resolveString = (
    originalExpression: ts.Expression,
    resolving = new Set<string>(),
    bindings: Bindings = new Map(),
  ): string | null => {
    const expression = unwrapExpression(originalExpression);
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
      return expression.text;
    }
    if (ts.isIdentifier(expression)) {
      const bound = bindings.get(expression.text);
      if (bound) return resolveString(bound, resolving, bindings);
      let symbol = checker.getSymbolAtLocation(expression);
      if (symbol && (symbol.flags & ts.SymbolFlags.Alias)) {
        symbol = checker.getAliasedSymbol(symbol);
      }
      const declaration = symbol?.declarations?.find(
        (candidate): candidate is ts.VariableDeclaration =>
          ts.isVariableDeclaration(candidate) && Boolean(candidate.initializer),
      );
      if (!declaration?.initializer) return null;
      const identity = `${declaration.getSourceFile().fileName}:${declaration.pos}`;
      if (resolving.has(identity)) return null;
      const nextResolving = new Set(resolving).add(identity);
      return resolveString(declaration.initializer, nextResolving, bindings);
    }
    if (ts.isConditionalExpression(expression)) {
      const condition = resolveBoolean(expression.condition, bindings);
      if (condition === null) return null;
      return resolveString(
        condition ? expression.whenTrue : expression.whenFalse,
        resolving,
        bindings,
      );
    }
    if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)) {
      let symbol = checker.getSymbolAtLocation(expression.expression);
      if (symbol && (symbol.flags & ts.SymbolFlags.Alias)) {
        symbol = checker.getAliasedSymbol(symbol);
      }
      const declaration = symbol?.declarations?.find(
        (candidate): candidate is ts.VariableDeclaration & {
          initializer: ts.ArrowFunction | ts.FunctionExpression;
        } => {
          if (!ts.isVariableDeclaration(candidate) || !candidate.initializer) {
            return false;
          }
          return ts.isArrowFunction(candidate.initializer)
            || ts.isFunctionExpression(candidate.initializer);
        },
      );
      const factory = declaration?.initializer;
      if (!factory || ts.isBlock(factory.body)) return null;
      const factoryBindings = new Map(bindings);
      for (const [index, parameter] of factory.parameters.entries()) {
        if (!ts.isIdentifier(parameter.name)) return null;
        const value = expression.arguments[index] ?? parameter.initializer;
        if (!value) return null;
        factoryBindings.set(parameter.name.text, value);
      }
      return resolveString(factory.body, resolving, factoryBindings);
    }
    if (
      ts.isBinaryExpression(expression)
      && expression.operatorToken.kind === ts.SyntaxKind.PlusToken
    ) {
      const left = resolveString(expression.left, resolving, bindings);
      const right = resolveString(expression.right, resolving, bindings);
      return left === null || right === null ? null : `${left}${right}`;
    }
    if (ts.isTemplateExpression(expression)) {
      let result = expression.head.text;
      for (const span of expression.templateSpans) {
        const substitution = resolveString(span.expression, resolving, bindings);
        if (substitution === null) return null;
        result += substitution + span.literal.text;
      }
      return result;
    }
    return null;
  };

  const operations: ConsumerOperation[] = [];
  const operationLocations = new Set<string>();
  const addOperation = (expression: ts.Expression, document: string): void => {
    const position = sourceFile.getLineAndCharacterOfPosition(expression.getStart(sourceFile));
    const location = `${position.line + 1}:${position.character + 1}:${document}`;
    if (operationLocations.has(location)) return;
    operationLocations.add(location);
    operations.push({
      file: path.relative(frontendSourceDirectory, absolutePath).replaceAll('\\', '/'),
      line: position.line + 1,
      document,
    });
  };
  const collectEmbeddedDocuments = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node)
      || ts.isNoSubstitutionTemplateLiteral(node)
      || ts.isTemplateExpression(node)
    ) {
      const document = resolveString(node);
      if (document && looksLikeGraphqlDocument(document)) {
        addOperation(node, document);
      }
    }
    ts.forEachChild(node, collectEmbeddedDocuments);
  };
  collectEmbeddedDocuments(sourceFile);
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && GRAPHQL_CLIENT_FUNCTIONS.has(callName(node.expression) ?? '')) {
      const document = node.arguments[0] && resolveString(node.arguments[0]);
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      if (!document) {
        if (
          node.arguments[0]
          && (
            isFunctionParameterReference(node, node.arguments[0])
            || isFunctionParameterCall(node, node.arguments[0])
            || ts.isPropertyAccessExpression(unwrapExpression(node.arguments[0]))
          )
        ) {
          ts.forEachChild(node, visit);
          return;
        }
        throw new Error(
          `Unable to statically resolve GraphQL document at ${path.relative(frontendSourceDirectory, absolutePath).replaceAll('\\', '/')}:${position.line + 1}`,
        );
      }
      addOperation(node.arguments[0], document);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return operations;
};

describe('frontend GraphQL consumer contract', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'graphql-consumer-contract-secret';
    process.env.DATABASE_URL = 'postgresql://unused/consumer-contract';
    process.env.FRONTEND_URL = 'https://frontend.test.itemize';
    const query = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue({ query, end: jest.fn() })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.JWT_SECRET;
    delete process.env.DATABASE_URL;
    delete process.env.FRONTEND_URL;
  });

  it('validates every statically declared frontend operation against the generated schema', () => {
    expect(existsSync(frontendSourceDirectory)).toBe(true);
    const schema = app.get(GraphQLSchemaHost).schema;
    const frontendFiles = sourceFiles(frontendSourceDirectory);
    const program = ts.createProgram(frontendFiles, {
      allowJs: false,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2023,
    });
    const checker = program.getTypeChecker();
    const operations = frontendFiles.flatMap((absolutePath) => {
      const sourceFile = program.getSourceFile(absolutePath);
      if (!sourceFile) throw new Error(`TypeScript did not load ${absolutePath}`);
      return extractConsumerOperations(absolutePath, sourceFile, checker);
    });
    const failures = operations.flatMap((operation) => {
      let document;
      try {
        document = parse(operation.document);
      } catch (error) {
        return [`${operation.file}:${operation.line} ${String(error)}`];
      }
      return validate(schema, document).map(
        (error) => `${operation.file}:${operation.line} ${error.message}`,
      );
    });

    expect(operations.length).toBeGreaterThan(100);
    expect(failures).toEqual([]);
  });
});
