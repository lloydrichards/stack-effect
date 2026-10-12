import { defineModules } from "@repo/authoring";
import { clientModules } from "./client";
import { clientFoldkitModules } from "./client-foldkit";

export const workerHttpClientModules = defineModules(
  import.meta.url,
  [...clientModules.definitions, ...clientFoldkitModules.definitions]
    .filter(
      (module) =>
        module.id === "client-react-http-api" ||
        module.id === "client-foldkit-http-api",
    )
    .map((module) => ({
      ...module,
      id: `${module.id}-worker`,
      title: `${module.title} for a Cloudflare Worker`,
      description: "Effect HTTP API client for a Cloudflare Worker",
      implies: [
        { targetKind: "cloudflare-worker", moduleId: "cloudflare-worker-http" },
      ],
      supportedRuntimes: ["bun", "node"],
      conflictsWith: [
        ...clientModules.definitions,
        ...clientFoldkitModules.definitions,
      ]
        .filter(
          (candidate) =>
            candidate.supportedOn.some(
              (target) =>
                target._tag === "kind" &&
                target.kind ===
                  module.supportedOn.find((target) => target._tag === "kind")
                    ?.kind,
            ) &&
            candidate.implies?.some(
              (dependency) => dependency.targetKind === "server",
            ),
        )
        .map((candidate) => candidate.id),
    })),
);
