// The published root entry, kept beside the concept subpaths so existing
// imports keep working. tsdown inlines the private workspace packages so the
// tarball depends only on its `effect` peer.
export * from "@repo/authoring/Build";
export * from "@repo/authoring/Define";
export * from "@repo/authoring/Official";
export * from "@repo/authoring/Template";
