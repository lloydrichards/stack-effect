import { RegistryProvider } from "@effect/atom-react";
import { RecipeBuilder } from "~/components/recipe-builder/recipe-builder";

export default function BuilderRoute() {
  return (
    <RegistryProvider>
      <RecipeBuilder />
    </RegistryProvider>
  );
}
