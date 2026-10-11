import type { PackageJsonField } from "@repo/domain/Catalog";
import { Schema } from "effect";

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Json));

/** Conditional exports resolve in property order, unlike ordinary metadata. */
export const comparablePackageJsonFieldValue = ({
  field,
  value,
}: typeof PackageJsonField.Type) =>
  field === "exports" ? encodeJson(value) : value;
