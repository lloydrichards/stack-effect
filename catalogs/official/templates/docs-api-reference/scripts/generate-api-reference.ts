import { rename, rm, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Project } from "ts-morph";

const entryPoints = process.argv
  .slice(2)
  .map((entryPoint) => resolve(entryPoint));

if (entryPoints.length === 0) {
  throw new Error(
    "Pass one or more public TypeScript entry points to bun run docs:api.",
  );
}

const project = new Project();
const sources = [...new Set(entryPoints)].map((entryPoint) =>
  project.addSourceFileAtPath(entryPoint),
);
project.resolveSourceFileDependencies();
const checker = project.getTypeChecker().compilerObject;

const entries = sources.map((source) => ({
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
}));

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
