export const registryUrl = (appOrigin: string, appBasePath: string) =>
  new URL(
    "registry/v1/catalog.json",
    new URL(
      appBasePath.endsWith("/") ? appBasePath : `${appBasePath}/`,
      appOrigin,
    ),
  ).toString();
