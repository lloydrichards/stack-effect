export const labsFixtureUrl =
  "https://fixture.example.test/registry/v1/labs.json";
export const labsCatalogArgs = [
  "--catalog",
  "official",
  "--catalog",
  `labs=${labsFixtureUrl}`,
] as const;
