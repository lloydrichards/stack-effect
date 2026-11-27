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
    tsConfigFilePath === undefined ? {} : { tsConfigFilePath },
  );
  const source = project.addSourceFileAtPath(entryPoint);
  project.resolveSourceFileDependencies();

  // Follow re-exports only. Unrelated library imports need not resolve.
  const publicSources = new Set([source]);
  for (const file of publicSources) {
    for (const declaration of file.getExportDeclarations()) {
      const specifier = declaration.getModuleSpecifierValue();
      if (specifier === undefined) continue;

      const target = declaration.getModuleSpecifierSourceFile();
      if (!target) {
        throw new Error(
          `Cannot resolve re-export ${specifier} from ${file.getFilePath()}.`,
        );
      }
      publicSources.add(target);
    }
  }

  const exportedSymbols = source.getExportSymbols();
  const unresolved = exportedSymbols.find(
    (symbol) =>
      symbol.isAlias() && !symbol.getAliasedSymbol()?.getDeclarations().length,
  );
  if (unresolved) {
    throw new Error(
      `Cannot resolve exported alias ${unresolved.getName()} from ${entryPoint}.`,
    );
  }

  const checker = project.getTypeChecker().compilerObject;
  return {
    entryPoint: relative(process.cwd(), source.getFilePath()),
    members: exportedSymbols.map((exported) => {
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
