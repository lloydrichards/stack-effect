# Effect virtual filesystem compatibility

`@effect-vfs/core` and `@effect-vfs/memory` 0.10.0 still import `effect/Crypto`, which Effect 4.1 removed. The Bun patches replace random-byte generation with `SecureRandom` and SHA-256 hashing with `Digest`, update their declaration files, and align their Effect peers with 4.1.4. The memory adapter also exposes `readDirectoryEntries` so Effect can derive its current glob implementation.

Bun applies these patches during installation. Remove both patches and their `patchedDependencies` entries when an upstream release supports Effect 4.1. Verify the memory filesystem, repository baseline, catalog cache, Apply preview, and browser Recipe Builder tests before removing them.
