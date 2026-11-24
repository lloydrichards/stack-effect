/** The published module IDs that changed sources in the Labs launch. */
const movedToLabs = [
  "client-react-web-worker",
  "package-ai-toolkit-webfetch",
  "server-chat-runtime-managed",
] as const;

export const isMovedToLabs = (id: string) =>
  movedToLabs.some((moved) => moved === id);
