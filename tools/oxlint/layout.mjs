// Repository layout rules that oxlint has no built-in rule for.
import path from "node:path";

// Every file name Vitest would collect as a test, plus shared fixtures.
const testOrFixture = /\.(test|spec|fixture)\.[cm]?[jt]sx?$/;

// Match against the path inside the repository, so a checkout that itself
// sits under a `src/` directory does not trip the rule.
const repositoryPath = (filename, cwd) =>
  path.relative(cwd, filename).split(path.sep).join("/");

export default {
  meta: { name: "layout" },
  rules: {
    "no-src-tests": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Keep tests and fixtures in the package's test/ directory, outside src/.",
        },
      },
      create: (context) => ({
        Program: (node) => {
          const file = repositoryPath(
            context.filename,
            context.cwd ?? process.cwd(),
          );
          if (/(^|\/)src\//.test(file) && testOrFixture.test(file)) {
            context.report({
              node,
              message:
                "Move tests to test/ and fixtures to test/fixtures/, outside src/.",
            });
          }
        },
      }),
    },
  },
};
