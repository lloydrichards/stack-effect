import { DatabaseSync } from "node:sqlite";

// Deno exposes loadExtension but not Node's enableLoadExtension toggle.
// Keep extensions disabled except while Effect SQL explicitly requests one.
if (!Object.getOwnPropertyDescriptor(DatabaseSync.prototype, "enableLoadExtension")) {
  const enabled = new WeakSet<DatabaseSync>();
  const loadExtension = DatabaseSync.prototype.loadExtension;
  Object.defineProperty(DatabaseSync.prototype, "enableLoadExtension", {
    configurable: true,
    value(this: DatabaseSync, allow: boolean) {
      if (allow) enabled.add(this);
      else enabled.delete(this);
    },
  });
  Object.defineProperty(DatabaseSync.prototype, "loadExtension", {
    configurable: true,
    value(this: DatabaseSync, path: string) {
      if (!enabled.has(this)) throw new Error("SQLite extension loading is disabled");
      return loadExtension.call(this, path);
    },
  });
}
