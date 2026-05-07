import type {
  CompositionOperation,
  TsAddImportOp,
  TsAddReexportOp,
  TsAppendCallArgOp,
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
      // Check if argument already exists
      const args = initializer.getArguments();
      const alreadyExists = args.some((arg) => arg.getText() === op.argument);
      if (!alreadyExists) {
        initializer.addArgument(op.argument);
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
      // Check if argument already exists
      const args = call.getArguments();
      const alreadyExists = args.some((arg) => arg.getText() === op.argument);
      if (!alreadyExists) {
        call.addArgument(op.argument);
      }
      return;
    }
  }

  return yield* new TargetNotFoundError({
    targetVariable: op.targetVariable,
    functionName: op.functionName,
  });
});
