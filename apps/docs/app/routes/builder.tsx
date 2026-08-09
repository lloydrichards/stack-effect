import { RegistryProvider } from "@effect/atom-react";
import { RecipeBuilder } from "~/features/recipe-builder/recipe-builder";

export default function BuilderRoute() {
  return (
    <RegistryProvider>
      <RecipeBuilder />
    </RegistryProvider>
  );
}
