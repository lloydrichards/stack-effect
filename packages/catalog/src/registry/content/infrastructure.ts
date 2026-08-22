export const alchemyRunContents = `import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

const targetId = "{{targetKey}}";
const resourceId = "{{providerSafeProjectName}}-{{generationDomainAdapterId}}-{{providerSafeTargetName}}-{{stableIdentityHash}}";

export default Alchemy.Stack(
  "{{providerSafeProjectName}}",
  {
    providers: Cloudflare.providers(),
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const website = yield* Cloudflare.Website.Vite(resourceId, {
      rootDir: "{{targetPath}}",
      assets: {
        notFoundHandling: "single-page-application",
      },
    });

    return {
      stage,
      targetId,
      resourceId,
      url: website.url,
      urls: website.urls,
    };
  }),
);
`;
