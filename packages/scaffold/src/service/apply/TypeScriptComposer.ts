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
import type { CallExpression, ImportDeclaration, SourceFile } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";

class TargetNotFoundError extends Data.TaggedError("TargetNotFoundError")<{
  targetVariable: string;
  functionName: string;
}> {}

// =============================================================================
// Service Definition
// =============================================================================

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

// =============================================================================
// Implementation Helpers
// =============================================================================

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
  // Check if re-export already exists
  const existingExport = sourceFile.getExportDeclaration(
    (decl) => decl.getModuleSpecifierValue() === op.moduleSpecifier,
  );

  if (existingExport) {
    // If namedExports specified, add them to existing export
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

  // Add new export declaration
  if (op.namedExports && op.namedExports.length > 0) {
    sourceFile.addExportDeclaration({
      moduleSpecifier: op.moduleSpecifier,
      namedExports: [...op.namedExports],
      isTypeOnly: op.typeOnly ?? false,
    });
  } else {
    // Star export: export * from "..."
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

  // If the only argument is an array literal, add inside it
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

  // Otherwise add as a regular function argument
  const alreadyExists = args.some((arg) => arg.getText() === argument);
  if (!alreadyExists) {
    call.addArgument(argument);
  }
};

const applyTsAppendCallArg = Effect.fn("applyTsAppendCallArg")(function* (
  sourceFile: SourceFile,
  op: typeof TsAppendCallArgOp.Type,
) {
  // Find variable declaration with the target name
  const variableDeclaration = sourceFile.getVariableDeclaration(
    op.targetVariable,
  );

  if (!variableDeclaration) {
    return yield* new TargetNotFoundError({
      targetVariable: op.targetVariable,
      functionName: op.functionName,
    });
  }

  const initializer = variableDeclaration.getInitializer();
  if (!initializer) {
    return yield* new TargetNotFoundError({
      targetVariable: op.targetVariable,
      functionName: op.functionName,
    });
  }

  // Helper to check if a call expression matches the function name
  const isMatchingCall = (call: CallExpression): boolean => {
    const expression = call.getExpression();

    // Check for property access (e.g., Layer.mergeAll)
    if (expression.isKind(SyntaxKind.PropertyAccessExpression)) {
      const fullText = expression.getText();
      if (fullText === op.functionName) {
        return true;
      }
    }

    // Check for identifier (e.g., mergeAll)
    if (expression.isKind(SyntaxKind.Identifier)) {
      const name = expression.getText();
      // Match if function name is just the identifier or ends with it
      if (name === op.functionName || op.functionName.endsWith(`.${name}`)) {
        return true;
      }
    }

    return false;
  };

  // First check if initializer itself is the call expression
  if (initializer.isKind(SyntaxKind.CallExpression)) {
    if (isMatchingCall(initializer)) {
      // Check if this is a curried call: the matching call might be the callee
      // of an outer call expression (e.g., Subscription.aggregate<M, Msg>()())
      const parent = initializer.getParent();
      if (parent && parent.isKind(SyntaxKind.CallExpression)) {
        appendToCallOrArray(parent, op.argument);
      } else {
        appendToCallOrArray(initializer, op.argument);
      }
      return;
    }
  }

  // Search descendants for the call
  const callExpressions = initializer.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  );

  for (const call of callExpressions) {
    if (isMatchingCall(call)) {
      // Check if the matching call is the callee of a parent call (curried pattern)
      const parent = call.getParent();
      if (parent && parent.isKind(SyntaxKind.CallExpression)) {
        const parentCall = parent as CallExpression;
        // Verify the parent's expression is our matching call
        if (parentCall.getExpression() === call) {
          appendToCallOrArray(parentCall, op.argument);
          return;
        }
      }
      appendToCallOrArray(call, op.argument);
      return;
    }
  }

  return yield* new TargetNotFoundError({
    targetVariable: op.targetVariable,
    functionName: op.functionName,
  });
});

// =============================================================================
// Object Field Injection
// =============================================================================

const applyTsObjectField = Effect.fn("applyTsObjectField")(function* (
  sourceFile: SourceFile,
  op: typeof TsObjectFieldOp.Type,
) {
  // Find variable declaration with the target name
  const variableDeclaration = sourceFile.getVariableDeclaration(
    op.targetVariable,
  );

  if (!variableDeclaration) {
    return yield* new TargetNotFoundError({
      targetVariable: op.targetVariable,
      functionName: op.functionName,
    });
  }

  const initializer = variableDeclaration.getInitializer();
  if (!initializer) {
    return yield* new TargetNotFoundError({
      targetVariable: op.targetVariable,
      functionName: op.functionName,
    });
  }

  // Helper to check if a call expression matches the function name
  const isMatchingCall = (call: CallExpression): boolean => {
    const expression = call.getExpression();

    if (expression.isKind(SyntaxKind.PropertyAccessExpression)) {
      if (expression.getText() === op.functionName) return true;
    }

    if (expression.isKind(SyntaxKind.Identifier)) {
      const name = expression.getText();
      if (name === op.functionName || op.functionName.endsWith(`.${name}`))
        return true;
    }

    return false;
  };

  const addFieldToCall = (call: CallExpression): boolean => {
    const args = call.getArguments();
    // Find the first object literal argument
    const objectArg = args.find((arg) =>
      arg.isKind(SyntaxKind.ObjectLiteralExpression),
    );

    if (!objectArg) return false;

    const objectLiteral = objectArg.asKindOrThrow(
      SyntaxKind.ObjectLiteralExpression,
    );

    // Check if field already exists
    const existingProp = objectLiteral.getProperty(op.field);
    if (existingProp) return true;

    // Add the new property
    objectLiteral.addPropertyAssignment({
      name: op.field,
      initializer: op.value,
    });
    return true;
  };

  // First check if initializer itself is the call expression
  if (initializer.isKind(SyntaxKind.CallExpression)) {
    if (isMatchingCall(initializer) && addFieldToCall(initializer)) return;
  }

  // Search descendants for the call
  const callExpressions = initializer.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  );

  for (const call of callExpressions) {
    if (isMatchingCall(call) && addFieldToCall(call)) return;
  }

  return yield* new TargetNotFoundError({
    targetVariable: op.targetVariable,
    functionName: op.functionName,
  });
});

// =============================================================================
// JSX Slot Injection
// =============================================================================

const applyTsJsxSlot = (
  sourceFile: SourceFile,
  op: typeof TsJsxSlotOp.Type,
): void => {
  const text = sourceFile.getFullText();
  const slotMarker = `{/* @slot:${op.slotId} */}`;
  const index = text.indexOf(slotMarker);

  if (index === -1) return;

  // Insert content after the slot marker (on the next line)
  const insertPos = index + slotMarker.length;
  const newText = `${text.slice(0, insertPos)}\n        ${op.content}${text.slice(insertPos)}`;
  sourceFile.replaceWithText(newText);
};
