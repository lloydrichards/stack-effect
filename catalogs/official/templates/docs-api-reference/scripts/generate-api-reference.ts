import { rename, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Project, ts } from "ts-morph";

const entryPoints = process.argv
  .slice(2)
  .map((entryPoint) => resolve(entryPoint));

if (entryPoints.length === 0) {
  throw new Error(
    "Pass one or more public TypeScript entry points to bun run docs:api.",
  );
}

const entries = [...new Set(entryPoints)].map((entryPoint) => {
  const tsConfigFilePath = ts.findConfigFile(
    dirname(entryPoint),
    ts.sys.fileExists,
  );
  const project = new Project(
    tsConfigFilePath === undefined
      ? {}
      : { tsConfigFilePath, skipAddingFilesFromTsConfig: true },
  );
  const source = project.addSourceFileAtPath(entryPoint);
  project.resolveSourceFileDependencies();

  // An unresolved re-export can leave a barrel with a partial export list.
  const invalidExport = project.getPreEmitDiagnostics().find((diagnostic) => {
    const source = diagnostic.getSourceFile();
    const start = diagnostic.getStart();
    return (
      start !== undefined &&
      source
        ?.getExportDeclarations()
        .some(
          (declaration) =>
            start >= declaration.getStart() && start < declaration.getEnd(),
        )
    );
  });
  if (invalidExport) {
    throw new Error(
      `Cannot generate exports for ${entryPoint}.
${project.formatDiagnosticsWithColorAndContext([invalidExport])}`,
    );
  }

  const checker = project.getTypeChecker().compilerObject;
  return {
    entryPoint: relative(process.cwd(), source.getFilePath()),
    members: source.getExportSymbols().map((exported) => {
      const declaration = exported.getAliasedSymbol() ?? exported;
      return {
        name: exported.getName(),
        summary: declaration.compilerSymbol
          .getDocumentationComment(checker)
          .map((part) => part.text)
          .join(""),
      };
    }),
  };
});

const output = fileURLToPath(
  new URL("../app/lib/api-exports.json", import.meta.url),
);
const temporary = `${output}.${process.pid}.tmp`;

try {
  await writeFile(temporary, `${JSON.stringify(entries, null, 2)}\n`);
  await rename(temporary, output);
} finally {
  await rm(temporary, { force: true });
}
