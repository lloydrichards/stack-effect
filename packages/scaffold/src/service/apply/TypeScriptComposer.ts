import type {
  CompositionOperation,
  TsAddImportOp,
  TsAddReexportOp,
  TsAppendCallArgOp,
  TsJsxSlotOp,
  TsObjectFieldOp,
} from "@repo/domain/Plan";
import {
  Array as Arr,
  Context,
  Data,
  Effect,
  Layer,
  Match,
  Option,
  pipe,
} from "effect";
import type {
  CallExpression,
  ImportDeclaration,
  Node,
  SourceFile,
} from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";

class TargetNotFoundError extends Data.TaggedError("TargetNotFoundError")<{
  targetVariable: string;
  functionName: string;
}> {}

export class TypeScriptComposer extends Context.Service<TypeScriptComposer>()(
  "TypeScriptComposer",
  {
    make: Effect.succeed({
      compose: Effect.fn(function* (
        contents: string,
        operations: ReadonlyArray<
          typeof CompositionOperation.cases.typescript.Type
        >,
      ) {
        const project = new Project({
          useInMemoryFileSystem: true,
          skipAddingFilesFromTsConfig: true,
        });

        const sourceFile = project.createSourceFile("temp.ts", contents);

        yield* Effect.forEach(
          operations,
          (op) =>
            Match.value(op).pipe(
              Match.tag("ts-add-import", (importOp) =>
                Effect.sync(() => applyTsAddImport(sourceFile, importOp)),
              ),
              Match.tag("ts-add-reexport", (reexportOp) =>
                Effect.sync(() => applyTsAddReexport(sourceFile, reexportOp)),
              ),
              Match.tag("ts-append-call-arg", (appendOp) =>
                applyTsAppendCallArg(sourceFile, appendOp),
              ),
              Match.tag("ts-object-field", (fieldOp) =>
                applyTsObjectField(sourceFile, fieldOp),
              ),
              Match.tag("ts-jsx-slot", (slotOp) =>
                Effect.sync(() => applyTsJsxSlot(sourceFile, slotOp)),
              ),
              Match.exhaustive,
            ),
          { discard: true },
        );

        return sourceFile.getFullText();
      }),
    }),
  },
) {
  static readonly layer = Layer.effect(TypeScriptComposer)(
    TypeScriptComposer.make,
  );
}

const applyTsAddImport = (
  sourceFile: SourceFile,
  op: typeof TsAddImportOp.Type,
) =>
  pipe(
    Option.fromNullishOr(
      sourceFile.getImportDeclaration(
        (decl) => decl.getModuleSpecifierValue() === op.moduleSpecifier,
      ),
    ),
    Option.match({
      onNone: () => {
        sourceFile.addImportDeclaration({
          moduleSpecifier: op.moduleSpecifier,
          isTypeOnly: op.typeOnly ?? false,
          ...(op.namedImports && { namedImports: [...op.namedImports] }),
          ...(op.defaultImport && { defaultImport: op.defaultImport }),
          ...(op.namespaceImport && { namespaceImport: op.namespaceImport }),
        });
      },
      onSome: (decl) => {
        if (op.namedImports)
          Arr.forEach(
            Arr.difference(
              op.namedImports,
              decl.getNamedImports().map((ni) => ni.getName()),
            ),
            (name) => decl.addNamedImport(name),
          );
      },
    }),
  );

const applyTsAddReexport = (
  sourceFile: SourceFile,
  op: typeof TsAddReexportOp.Type,
): void => {
  const existingExport = sourceFile.getExportDeclaration(
    (decl) => decl.getModuleSpecifierValue() === op.moduleSpecifier,
  );

  if (existingExport) {
    if (op.namedExports) {
      const existingNamedExports = existingExport.getNamedExports();
      for (const namedExport of op.namedExports) {
        const alreadyExists = existingNamedExports.some(
          (ne) => ne.getName() === namedExport,
        );
        if (!alreadyExists) {
          existingExport.addNamedExport(namedExport);
        }
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

const applyTsAppendCallArg = Effect.fn("applyTsAppendCallArg")(function* (
  sourceFile: SourceFile,
  op: typeof TsAppendCallArgOp.Type,
) {
  const initializer = getTargetInitializer(sourceFile, op.targetVariable);
  if (Option.isNone(initializer)) {
    return yield* new TargetNotFoundError({
      targetVariable: op.targetVariable,
      functionName: op.functionName,
    });
  }

  const call = findCallExpression(initializer.value, op.functionName);
  if (call) {
    appendToCallOrArray(toOuterCurriedCall(call), op.argument);
    return;
  }

  return yield* new TargetNotFoundError({
    targetVariable: op.targetVariable,
    functionName: op.functionName,
  });
});

const applyTsObjectField = Effect.fn("applyTsObjectField")(function* (
  sourceFile: SourceFile,
  op: typeof TsObjectFieldOp.Type,
) {
  const initializer = getTargetInitializer(sourceFile, op.targetVariable);
  if (Option.isNone(initializer)) {
    return yield* new TargetNotFoundError({
      targetVariable: op.targetVariable,
      functionName: op.functionName,
    });
  }

  const addFieldToCall = (call: CallExpression): boolean => {
    const args = call.getArguments();
    const objectArg = args.find((arg) =>
      arg.isKind(SyntaxKind.ObjectLiteralExpression),
    );

    if (!objectArg) return false;

    const objectLiteral = objectArg.asKindOrThrow(
      SyntaxKind.ObjectLiteralExpression,
    );

    const existingProp = objectLiteral.getProperty(op.field);
    if (existingProp) return true;

    objectLiteral.addPropertyAssignment({
      name: op.field,
      initializer: op.value,
    });
    return true;
  };

  const call = findCallExpression(initializer.value, op.functionName);
  if (call && addFieldToCall(call)) {
    return;
  }

  return yield* new TargetNotFoundError({
    targetVariable: op.targetVariable,
    functionName: op.functionName,
  });
});

const applyTsJsxSlot = (
  sourceFile: SourceFile,
  op: typeof TsJsxSlotOp.Type,
): void => {
  const text = sourceFile.getFullText();
  const slotMarker = `{/* @slot:${op.slotId} */}`;
  const index = text.indexOf(slotMarker);

  if (index === -1) return;

  const insertPos = index + slotMarker.length;
  const newText = `${text.slice(0, insertPos)}\n        ${op.content}${text.slice(insertPos)}`;
  sourceFile.replaceWithText(newText);
};
