// Stack Effect resolves tokens in every file it creates, including this
// project's own definitions. Building the token text at runtime keeps it
// intact until a consumer creates a project from your catalog.
// See https://github.com/lloydrichards/stack-effect/issues/304.
const token = (name: string) => `${"{".repeat(2)}${name}${"}".repeat(2)}`;

/** Where the consumer's target lives, for example `apps/app-demo`. */
export const targetPath = token("targetPath");
