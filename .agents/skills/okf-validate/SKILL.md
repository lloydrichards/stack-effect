---
name: okf-validate
description: Run the latest published okf-graph on an OKF bundle and report validation errors and warnings. Use for validation-only requests, including broken-link checks before merge.
---

# Validate an OKF bundle

Use the caller's bundle path. If omitted, find the root in the repository docs or index. With a known root, start with this check. It requires Bun on PATH. A fresh metadata cache prevents an offline run from silently resolving an old npm tag.

```bash
(
  lookup_cache=$(mktemp -d) || exit 1
  trap 'rm -rf -- "$lookup_cache"' EXIT
  version=$(npm view --cache "$lookup_cache" okf-graph@latest version) || exit 1
  test -n "$version" || exit 1
  printf 'Checking with okf-graph@%s\n' "$version" >&2
  npx --yes "okf-graph@$version" validate "<bundle-path>" --json
)
```

Use the exit status and JSON to report the bundle, resolved version, command, validity, and issues by severity. For a broken link `a->b`, use `<bundle-path>/a.md` when `source` is `graph`. When `source` is `index`, `a` already contains the relative filename (such as `index.md`). For file-level errors, use the reported filename. Read the affected file if you need to disambiguate a finding. Group repeated findings by reason and count. A valid bundle can have warnings.

A JSON verdict of `valid: false` is a completed check even when the CLI exits nonzero. Report the errors. If lookup fails or execution ends without a validity verdict, report the cause and the incomplete check. Leave the bundle, log, dependencies, and lockfiles untouched.
