/**
 * Creates a fresh in-memory implementation of `FileSystem.FileSystem`.
 *
 * Each execution owns an isolated volume. Use `layer` when providing the
 * implementation through Effect's service context.
 */
export { layer, make } from "./service/memoryFileSystem";
