import { rename, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Node,
  Project,
  ts,
  type ExportDeclaration,
  type Symbol,
} from "ts-morph";

const entryPoints = process.argv
  .slice(2)
  .map((entryPoint) => resolve(entryPoint));

if (entryPoints.length === 0) {
  throw new Error(
    "Pass one or more public TypeScript entry points to bun run docs:api.",
  );
}

const moduleStatements = (declaration: Node) => {
  if (Node.isSourceFile(declaration)) return declaration.getStatements();
  if (!Node.isModuleDeclaration(declaration)) return [];
  const body = declaration.getBody();
  return Node.isModuleBlock(body) ? body.getStatements() : [];
};

const importedBinding = (declaration: Node) => {
  if (Node.isImportSpecifier(declaration)) {
    const module = declaration
      .getImportDeclaration()
      .getModuleSpecifier()
      .getSymbol();
    return module && { module, name: declaration.getName() };
  }
  if (Node.isExportSpecifier(declaration)) {
    const module = declaration
      .getExportDeclaration()
      .getModuleSpecifier()
      ?.getSymbol();
    return module && { module, name: declaration.getName() };
  }
};

function* qualifiedBindings(declaration: Node, aliases: Set<Symbol>) {
  if (!Node.isImportEqualsDeclaration(declaration)) return;
  let reference = declaration.getModuleReference();
  while (Node.isQualifiedName(reference)) {
    const name = reference.getRight().getText();
    reference = reference.getLeft();
    const qualifier = reference.getSymbol();
    if (!qualifier) continue;
    aliases.add(qualifier);
    const module = qualifier.getAliasedSymbol() ?? qualifier;
    yield { module, name };
  }
}

const publicImports = (exported: Symbol) => {
  const imports: Array<{ module: Symbol; name: string }> = [];
  const aliases = new Set([exported]);
  for (const alias of aliases) {
    if (!alias.isAlias()) continue;
    for (const declaration of alias.getDeclarations()) {
      for (const binding of qualifiedBindings(declaration, aliases))
        imports.push(binding);
      const imported = importedBinding(declaration);
      if (imported) imports.push(imported);
    }
    const next = alias.getImmediatelyAliasedSymbol();
    if (next) aliases.add(next);
  }
  return imports;
};

const recordStarExports = (
  { module, name }: { module: Symbol; name: string },
  namedImports: Map<ExportDeclaration, Set<string>>,
) => {
  const sources = new Set([module]);
  for (const source of sources) {
    if (source.compilerSymbol.exports?.has(ts.escapeLeadingUnderscores(name)))
      continue;
    for (const statement of source
      .getDeclarations()
      .flatMap(moduleStatements)) {
      if (
        !Node.isExportDeclaration(statement) ||
        statement.compilerNode.exportClause
      )
        continue;
      const specifier = statement.getModuleSpecifier();
      const target = specifier?.getSymbol();
      if (!target) {
        throw new Error(
          `Cannot resolve re-export ${specifier?.getLiteralValue()} from ${statement.getSourceFile().getFilePath()}.`,
        );
      }
      sources.add(target);
      const names = namedImports.get(statement) ?? new Set<string>();
      names.add(name);
      namedImports.set(statement, names);
    }
  }
};

const validateExports = (
  project: Project,
  root: Symbol,
  entryPoint: string,
) => {
  const modules = new Set([root]);
  const reExports = new Set<ExportDeclaration>();
  const namedImports = new Map<ExportDeclaration, Set<string>>();

  // Visit modules exposed by re-export declarations or public namespace aliases.
  for (const module of modules) {
    for (const statement of module
      .getDeclarations()
      .flatMap(moduleStatements)) {
      if (!Node.isExportDeclaration(statement)) continue;
      const specifier = statement.getModuleSpecifier();
      if (!specifier) continue;

      const target = specifier.getSymbol();
      if (!target) {
        throw new Error(
          `Cannot resolve re-export ${specifier.getLiteralValue()} from ${statement.getSourceFile().getFilePath()}.`,
        );
      }

      reExports.add(statement);
      modules.add(target);
    }

    for (const exported of module.getExports()) {
      const resolved = exported.isAlias()
        ? exported.getAliasedSymbol()
        : exported;
      if (!resolved?.getDeclarations().length) {
        throw new Error(
          `Cannot resolve exported alias ${exported.getName()} from ${entryPoint}.`,
        );
      }
      if (resolved.getFlags() & ts.SymbolFlags.Module) modules.add(resolved);

      for (const imported of publicImports(exported))
        recordStarExports(imported, namedImports);
    }
  }

  // TypeScript's export symbol table resolves a star collision to one member.
  // Consult the compiler diagnostic so an ambiguous barrel cannot publish it.
  const ambiguity = project.getPreEmitDiagnostics().find((diagnostic) => {
    if (diagnostic.getCode() !== 2308) return false;
    const file = diagnostic.getSourceFile();
    const start = diagnostic.getStart();
    const message = ts.flattenDiagnosticMessageText(
      diagnostic.compilerObject.messageText,
      "\n",
    );
    const declarations = new Set(reExports);
    for (const [declaration, names] of namedImports) {
      if (
        [...names].some((name) =>
          message.endsWith(
            `named '${name}'. Consider explicitly re-exporting to resolve the ambiguity.`,
          ),
        )
      ) {
        declarations.add(declaration);
      }
    }
    return (
      start !== undefined &&
      [...declarations].some(
        (declaration) =>
          declaration.getSourceFile() === file &&
          start >= declaration.getStart() &&
          start < declaration.getEnd(),
      )
    );
  });
  if (ambiguity) {
    throw new Error(
      `Cannot generate exports for ${entryPoint}.
${project.formatDiagnosticsWithColorAndContext([ambiguity])}`,
    );
  }
};

const entries = [...new Set(entryPoints)].map((entryPoint) => {
  const tsConfigFilePath = ts.findConfigFile(
    dirname(entryPoint),
    ts.sys.fileExists,
  );
  const project = new Project({
    ...(tsConfigFilePath === undefined ? {} : { tsConfigFilePath }),
    // Keep module resolution, but check ambiguous exports even in declaration files.
    compilerOptions: { noCheck: false, skipLibCheck: false },
  });
  const source = project.addSourceFileAtPath(entryPoint);
  project.resolveSourceFileDependencies();

  const root = source.getSymbol();
  if (root) validateExports(project, root, entryPoint);
  const exportedSymbols = source.getExportSymbols();

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
