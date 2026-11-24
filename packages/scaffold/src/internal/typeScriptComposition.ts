import { ApplyError } from "@repo/domain/Apply";
import type {
  TsAddImportOp,
  TsAppendCallArgOp,
  TsJsxSlotOp,
  TsObjectFieldOp,
  TypeScriptCompositionOperation,
} from "@repo/domain/Plan";
import { Effect, Equal, Match, Option, pipe, Predicate } from "effect";
import type { CallExpression, Node, SourceFile } from "ts-morph";
import {
  IndentationText,
  NewLineKind,
  Project,
  QuoteKind,
  SyntaxKind,
  ts,
} from "ts-morph";
import { findJsxSlotMarker, isJsxSlotMarker, jsxSlotMarker } from "./jsxSlot";

const applyTsAddImport = (sourceFile: SourceFile, op: TsAddImportOp) => {
  // Older projects may already bind a name through another specifier, such as
  // a package barrel instead of its subpath export. A second binding of the
  // same name would not parse, so keep the existing import.
  const bound = localImportBindings(sourceFile);
  const unbound = (name: string | undefined) =>
    name === undefined || bound.has(name) ? undefined : name;
  const namedImports = op.namedImports?.filter((name) => !bound.has(name));
  const defaultImport = unbound(op.defaultImport);
  const namespaceImport = unbound(op.namespaceImport);

  const requested = [
    ...(op.namedImports ?? []),
    op.defaultImport,
    op.namespaceImport,
  ].filter(Predicate.isNotUndefined);
  const added = [
    ...(namedImports ?? []),
    defaultImport,
    namespaceImport,
  ].filter(Predicate.isNotUndefined);

  if (requested.length > 0 && added.length === 0) {
    return;
  }

  const existingImport = sourceFile.getImportDeclaration(
    (decl) => decl.getModuleSpecifierValue() === op.moduleSpecifier,
  );

  if (existingImport === undefined) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: op.moduleSpecifier,
      isTypeOnly: op.typeOnly ?? false,
      ...(namedImports?.length && { namedImports }),
      ...(defaultImport && { defaultImport }),
      ...(namespaceImport && { namespaceImport }),
    });
    return;
  }

  existingImport.addNamedImports(namedImports ?? []);
};

const localImportBindings = (sourceFile: SourceFile): ReadonlySet<string> =>
  new Set(
    sourceFile
      .getImportDeclarations()
      .flatMap((decl) => [
        ...decl
          .getNamedImports()
          .map((named) => named.getAliasNode()?.getText() ?? named.getName()),
        ...[decl.getDefaultImport(), decl.getNamespaceImport()].flatMap(
          (identifier) =>
            identifier === undefined ? [] : [identifier.getText()],
        ),
      ]),
  );

// A sole array-literal argument, as in `Command.withSubcommands([])`, takes
// the new value as an element instead of a second argument.
const appendToCallOrArray = (call: CallExpression, argument: string): void => {
  const args = call.getArguments();

  if (
    args.length === 1 &&
    args[0] !== undefined &&
    args[0].isKind(SyntaxKind.ArrayLiteralExpression)
  ) {
    const array = args[0].asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
    const alreadyExists = array
      .getElements()
      .some((el) => el.getText() === argument);
    if (!alreadyExists) {
      array.addElement(argument);
    }
    return;
  }

  const alreadyExists = args.some((arg) => arg.getText() === argument);
  if (!alreadyExists) {
    call.addArgument(argument);
  }
};

const getTargetInitializer = (sourceFile: SourceFile, targetVariable: string) =>
  pipe(
    Option.fromNullishOr(sourceFile.getVariableDeclaration(targetVariable)),
    Option.flatMap((declaration) =>
      Option.fromNullishOr(declaration.getInitializer()),
    ),
  );

const isMatchingFunctionCall = (
  call: CallExpression,
  functionName: string,
): boolean => {
  const expression = call.getExpression();

  if (expression.isKind(SyntaxKind.PropertyAccessExpression)) {
    return expression.getText() === functionName;
  }

  if (expression.isKind(SyntaxKind.Identifier)) {
    const name = expression.getText();
    return name === functionName || functionName.endsWith(`.${name}`);
  }

  return false;
};

const findCallExpression = (
  initializer: Node,
  functionName: string,
): CallExpression | undefined => {
  if (
    initializer.isKind(SyntaxKind.CallExpression) &&
    isMatchingFunctionCall(initializer, functionName)
  ) {
    return initializer;
  }

  return initializer
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((call) => isMatchingFunctionCall(call, functionName));
};

const toOuterCurriedCall = (call: CallExpression): CallExpression => {
  const parent = call.getParent();
  if (
    parent?.isKind(SyntaxKind.CallExpression) &&
    parent.getExpression() === call
  ) {
    // NOTE: Curried calls carry the composition argument on the outer call.
    return parent;
  }
  return call;
};

const findTargetCall = (
  sourceFile: SourceFile,
  op: TsAppendCallArgOp | TsObjectFieldOp,
) =>
  pipe(
    getTargetInitializer(sourceFile, op.targetVariable),
    Option.flatMap((initializer) =>
      Option.fromUndefinedOr(findCallExpression(initializer, op.functionName)),
    ),
  );

const applyTsAppendCallArg = Effect.fnUntraced(function* (
  sourceFile: SourceFile,
  op: TsAppendCallArgOp,
) {
  const call = findTargetCall(sourceFile, op);
  if (Option.isNone(call))
    return yield* new ApplyError({
      message: `Could not find ${op.functionName} on ${op.targetVariable} during TypeScript composition.`,
    });

  appendToCallOrArray(toOuterCurriedCall(call.value), op.argument);
});

type SyntaxTree = [number, string | ReadonlyArray<SyntaxTree>];

// Compares parsed structure, so formatting and trailing commas do not conflict.
const expressionStructure = (value: string): SyntaxTree | string => {
  const source = ts.createSourceFile(
    "expression.ts",
    `const value = ${value};`,
    ts.ScriptTarget.Latest,
    true,
  );
  const statement = source.statements[0];
  if (!statement || !ts.isVariableStatement(statement)) return value;
  const expression = statement.declarationList.declarations[0]?.initializer;
  const leaf = (node: ts.Node) =>
    ts.isStringLiteral(node) ? node.text : node.getText(source);
  const syntax = (node: ts.Node): SyntaxTree => {
    const children = node.getChildren(source);
    const withoutTrailingComma =
      node.kind === ts.SyntaxKind.SyntaxList &&
      children.at(-1)?.kind === ts.SyntaxKind.CommaToken
        ? children.slice(0, -1)
        : children;
    return [
      node.kind,
      withoutTrailingComma.length > 0
        ? withoutTrailingComma.map(syntax)
        : leaf(node),
    ];
  };
  return expression ? syntax(expression) : value;
};

// Later properties win. An opaque spread or computed key can supply the field at runtime.
const objectFieldValue = (
  object: ts.ObjectLiteralExpression,
  field: string,
): ts.Expression | "unknown" | undefined => {
  for (const property of object.properties.toReversed()) {
    if (ts.isSpreadAssignment(property)) {
      if (!ts.isObjectLiteralExpression(property.expression)) return "unknown";
      const value = objectFieldValue(property.expression, field);
      if (value !== undefined) return value;
      continue;
    }
    const name = property.name;
    if (!name) return "unknown";
    const key = ts.isComputedPropertyName(name) ? name.expression : name;
    if (
      ts.isStringLiteralLike(key) ||
      ts.isNumericLiteral(key) ||
      (ts.isIdentifier(key) && !ts.isComputedPropertyName(name))
    ) {
      if (key.text !== field) continue;
      return ts.isPropertyAssignment(property)
        ? property.initializer
        : "unknown";
    }
    return "unknown";
  }
  return undefined;
};

const applyTsObjectField = Effect.fnUntraced(function* (
  sourceFile: SourceFile,
  op: TsObjectFieldOp,
) {
  const objectLiteral = pipe(
    findTargetCall(sourceFile, op),
    Option.flatMap((call) =>
      Option.fromUndefinedOr(
        call
          .getArguments()
          .find((arg) => arg.isKind(SyntaxKind.ObjectLiteralExpression)),
      ),
    ),
    Option.map((arg) => arg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression)),
  );
  if (Option.isNone(objectLiteral))
    return yield* new ApplyError({
      message: `Could not find ${op.functionName} on ${op.targetVariable} during TypeScript composition.`,
    });

  const existingValue = objectFieldValue(
    objectLiteral.value.compilerNode,
    op.field,
  );
  if (existingValue !== undefined) {
    if (
      existingValue !== "unknown" &&
      Equal.equals(
        expressionStructure(existingValue.getText()),
        expressionStructure(op.value),
      )
    ) {
      return;
    }
    return yield* new ApplyError({
      message: `Conflicting value for ${op.targetVariable}.${op.field} during TypeScript composition.`,
    });
  }

  objectLiteral.value.addPropertyAssignment({
    name: op.field,
    initializer: op.value,
  });
});

const applyTsJsxSlot = Effect.fnUntraced(function* (
  sourceFile: SourceFile,
  op: TsJsxSlotOp,
  previousContents: Map<string, string>,
) {
  const text = sourceFile.getFullText();
  const marker = findJsxSlotMarker(sourceFile, op.slotId);

  if (!marker) {
    return yield* new ApplyError({
      message: `Could not find JSX slot ${jsxSlotMarker(op.slotId)} during TypeScript composition.`,
    });
  }

  const markerEnd = marker.getEnd();
  const parent = marker.getParent();
  const children =
    (
      parent.asKind(SyntaxKind.JsxElement) ??
      parent.asKind(SyntaxKind.JsxFragment)
    )?.getJsxChildren() ?? [];
  const markerIndex = children.findIndex((child) => child === marker);
  const slotChildren = children.slice(markerIndex + 1);
  const nextMarkerIndex = slotChildren.findIndex(
    (child) =>
      child.getKind() === SyntaxKind.JsxExpression &&
      isJsxSlotMarker(child.asKindOrThrow(SyntaxKind.JsxExpression)),
  );
  const boundedSlotChildren =
    nextMarkerIndex === -1
      ? slotChildren
      : slotChildren.slice(0, nextMarkerIndex);
  const existingChild = boundedSlotChildren.find(
    (child) => child.getText().trim() === op.content.trim(),
  );

  if (existingChild !== undefined) {
    previousContents.set(op.slotId, op.content);
    return;
  }

  const previousContent = previousContents.get(op.slotId);
  const previousChild = boundedSlotChildren.find(
    (child) => child.getText().trim() === previousContent?.trim(),
  );
  const insertPos =
    previousContent !== undefined && previousChild !== undefined
      ? previousChild.getEnd()
      : markerEnd;
  const newText = `${text.slice(0, insertPos)}\n        ${op.content}${text.slice(insertPos)}`;
  sourceFile.replaceWithText(newText);
  previousContents.set(op.slotId, op.content);
});

const applyOperation = (
  composition: {
    sourceFile: SourceFile;
    previousJsxSlotContents: Map<string, string>;
  },
  operation: TypeScriptCompositionOperation,
) =>
  Match.valueTags(operation, {
    "ts-add-import": (importOp) =>
      Effect.sync(() => applyTsAddImport(composition.sourceFile, importOp)),
    "ts-append-call-arg": (appendOp) =>
      applyTsAppendCallArg(composition.sourceFile, appendOp),
    "ts-object-field": (fieldOp) =>
      applyTsObjectField(composition.sourceFile, fieldOp),
    "ts-jsx-slot": (slotOp) =>
      applyTsJsxSlot(
        composition.sourceFile,
        slotOp,
        composition.previousJsxSlotContents,
      ),
  });

/** @internal */
export const composeTypeScript: (
  contents: string,
  operations: ReadonlyArray<TypeScriptCompositionOperation>,
) => Effect.Effect<string, ApplyError> = Effect.fnUntraced(
  function* (contents, operations) {
    const project = new Project({
      useInMemoryFileSystem: true,
      skipAddingFilesFromTsConfig: true,
      manipulationSettings: {
        indentationText: IndentationText.TwoSpaces,
        newLineKind: NewLineKind.LineFeed,
        quoteKind: QuoteKind.Double,
      },
    });

    const sourceFile = project.createSourceFile(
      operations.some((operation) => operation._tag === "ts-jsx-slot")
        ? "temp.tsx"
        : "temp.ts",
      contents,
    );

    const composition = {
      sourceFile,
      previousJsxSlotContents: new Map<string, string>(),
    };
    yield* Effect.forEach(
      operations,
      (operation) => applyOperation(composition, operation),
      { discard: true },
    );

    return sourceFile.getFullText();
  },
);
