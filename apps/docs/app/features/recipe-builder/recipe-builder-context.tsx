import { createContext, type ReactNode, use } from "react";
import type { useRecipeBuilderState } from "./use-recipe-builder-state";

type RecipeBuilderContextValue = ReturnType<typeof useRecipeBuilderState>;

const RecipeBuilderContext = createContext<
  RecipeBuilderContextValue | undefined
>(undefined);

export function RecipeBuilderProvider({
  children,
  value,
}: {
  readonly children: ReactNode;
  readonly value: RecipeBuilderContextValue;
}) {
  return (
    <RecipeBuilderContext.Provider value={value}>
      {children}
    </RecipeBuilderContext.Provider>
  );
}

export function useRecipeBuilder() {
  const value = use(RecipeBuilderContext);
  if (value === undefined) {
    throw new Error(
      "useRecipeBuilder must be used inside RecipeBuilderProvider",
    );
  }
  return value;
}
