export const packagePackageJsonContents = `{
  "name": "{{packageName}}",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {},
  "dependencies": {
    "effect": "4.0.0-beta.67"
  },
  "devDependencies": {
    "@effect/language-service": "^0.85.1",
    "@repo/config-typescript": "workspace:*",
    "@types/bun": "^1.2.17",
    "typescript": "6.0.2",
    "vitest": "^4.1.4"
  }
}
`;

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
