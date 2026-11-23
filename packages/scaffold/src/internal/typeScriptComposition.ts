import { ApplyFailure } from "@repo/domain/Apply";
import type {
  TsAddImportOp,
  TsAddReexportOp,
  TsAppendCallArgOp,
  TsJsxSlotOp,
  TsObjectFieldOp,
  TypeScriptCompositionOperation,
} from "@repo/domain/Plan";
import { Effect, Match, Option, pipe } from "effect";
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

/** @internal */
export const composeTypeScript: (
  contents: string,
  operations: ReadonlyArray<TypeScriptCompositionOperation>,
) => Effect.Effect<string, ApplyFailure> = Effect.fnUntraced(
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

    const previousJsxSlotContents = new Map<string, string>();

    for (const op of operations) {
      yield* Match.valueTags(op, {
        "ts-add-import": (importOp) => {
          applyTsAddImport(sourceFile, importOp);
          return Effect.void;
        },
        "ts-add-reexport": (reexportOp) => {
          applyTsAddReexport(sourceFile, reexportOp);
          return Effect.void;
        },
        "ts-append-call-arg": (appendOp) =>
          applyTsAppendCallArg(sourceFile, appendOp),
        "ts-object-field": (fieldOp) => applyTsObjectField(sourceFile, fieldOp),
        "ts-jsx-slot": (slotOp) =>
          applyTsJsxSlot(sourceFile, slotOp, previousJsxSlotContents),
      });
    }

    return sourceFile.getFullText();
  },
);

const applyTsAddImport = (sourceFile: SourceFile, op: TsAddImportOp) => {
  const existingImport = sourceFile.getImportDeclaration(
    (decl) => decl.getModuleSpecifierValue() === op.moduleSpecifier,
  );

  if (existingImport === undefined) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: op.moduleSpecifier,
      isTypeOnly: op.typeOnly ?? false,
      ...(op.namedImports && { namedImports: [...op.namedImports] }),
      ...(op.defaultImport && { defaultImport: op.defaultImport }),
      ...(op.namespaceImport && { namespaceImport: op.namespaceImport }),
    });
    return;
  }

  if (op.namedImports) {
    const existingNames = new Set(
      existingImport.getNamedImports().map((ni) => ni.getName()),
    );
    for (const name of op.namedImports) {
      if (!existingNames.has(name)) existingImport.addNamedImport(name);
    }
  }
};

const applyTsAddReexport = (
  sourceFile: SourceFile,
  op: TsAddReexportOp,
): void => {
  const existingExport = sourceFile.getExportDeclaration(
    (decl) => decl.getModuleSpecifierValue() === op.moduleSpecifier,
  );

  if (existingExport) {
    if (op.namedExports) {
      const existingNamedExports = existingExport.getNamedExports();
      const missingExports = op.namedExports.filter(
        (namedExport) =>
          !existingNamedExports.some((ne) => ne.getName() === namedExport),
      );
      for (const namedExport of missingExports) {
        existingExport.addNamedExport(namedExport);
      }
    }
    return;
  }

  if (op.namedExports && op.namedExports.length > 0) {
    sourceFile.addExportDeclaration({
      moduleSpecifier: op.moduleSpecifier,
      namedExports: [...op.namedExports],
      isTypeOnly: op.typeOnly ?? false,
    });
  } else {
    sourceFile.addExportDeclaration({
      moduleSpecifier: op.moduleSpecifier,
      isTypeOnly: op.typeOnly ?? false,
    });
  }
};

/**
 * Append an argument to a call expression. If the call's sole argument is an
 * array literal, the new value is added as an element of that array instead
 * of as a second function argument. This handles patterns like
 * `Command.withSubcommands([])` where new entries belong inside the array.
 */
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

const applyTsAppendCallArg = Effect.fnUntraced(function* (
  sourceFile: SourceFile,
  op: TsAppendCallArgOp,
) {
  const initializer = getTargetInitializer(sourceFile, op.targetVariable);
  if (Option.isNone(initializer)) {
    return yield* missingTarget(op.targetVariable, op.functionName);
  }

  const call = findCallExpression(initializer.value, op.functionName);
  if (call) {
    appendToCallOrArray(toOuterCurriedCall(call), op.argument);
    return;
  }

  return yield* missingTarget(op.targetVariable, op.functionName);
});

const expressionStructure = (value: string): string => {
  const source = ts.createSourceFile(
    "expression.ts",
    `const value = ${value};`,
    ts.ScriptTarget.Latest,
    true,
  );
  const statement = source.statements[0];
  if (!statement || !ts.isVariableStatement(statement)) return value;
  const expression = statement.declarationList.declarations[0]?.initializer;
  type SyntaxTree = readonly [number, string | ReadonlyArray<SyntaxTree>];
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
        : ts.isStringLiteral(node)
          ? node.text
          : node.getText(source),
    ];
  };
  return expression ? JSON.stringify(syntax(expression)) : value;
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
  const initializer = getTargetInitializer(sourceFile, op.targetVariable);
  if (Option.isNone(initializer)) {
    return yield* missingTarget(op.targetVariable, op.functionName);
  }

  const call = findCallExpression(initializer.value, op.functionName);
  const objectArg = call
    ?.getArguments()
    .find((arg) => arg.isKind(SyntaxKind.ObjectLiteralExpression));
  if (!objectArg) {
    return yield* missingTarget(op.targetVariable, op.functionName);
  }

  const objectLiteral = objectArg.asKindOrThrow(
    SyntaxKind.ObjectLiteralExpression,
  );
  const existingValue = objectFieldValue(objectLiteral.compilerNode, op.field);
  if (existingValue !== undefined) {
    if (
      existingValue !== "unknown" &&
      expressionStructure(existingValue.getText()) ===
        expressionStructure(op.value)
    ) {
      return;
    }
    return yield* new ApplyFailure({
      message: `Conflicting value for ${op.targetVariable}.${op.field} during TypeScript composition.`,
    });
  }

  objectLiteral.addPropertyAssignment({
    name: op.field,
    initializer: op.value,
  });
  return;
});

const missingTarget = (targetVariable: string, functionName: string) =>
  Effect.fail(
    new ApplyFailure({
      message: `Could not find ${functionName} on ${targetVariable} during TypeScript composition.`,
    }),
  );

const applyTsJsxSlot = Effect.fnUntraced(function* (
  sourceFile: SourceFile,
  op: TsJsxSlotOp,
  previousContents: Map<string, string>,
) {
  const text = sourceFile.getFullText();
  const marker = findJsxSlotMarker(sourceFile, op.slotId);

  if (!marker) {
    return yield* new ApplyFailure({
      message: `Could not find JSX slot ${jsxSlotMarker(op.slotId)} during TypeScript composition.`,
    });
  }

  const markerEnd = marker.getEnd();
  const parent = marker.getParent();
  const children =
    parent.getKind() === SyntaxKind.JsxElement
      ? parent.asKindOrThrow(SyntaxKind.JsxElement).getJsxChildren()
      : parent.getKind() === SyntaxKind.JsxFragment
        ? parent.asKindOrThrow(SyntaxKind.JsxFragment).getJsxChildren()
        : [];
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
