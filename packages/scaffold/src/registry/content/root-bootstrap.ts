export const packageDomainTsconfigContents = `{
  "extends": "@repo/config-typescript/base.json",
  "compilerOptions": {
    "rootDir": "src",
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["dist", "build", "node_modules"]
}
`;
export const rootBootstrapFiles = {
  ".gitignore": "node_modules\n",
  "package.json": '{"private":true}',
  "packages/config-typescript/base.json": '{"compilerOptions":{}}',
  "turbo.json": '{"$schema":"https://turbo.build/schema.json"}',
} as const;
