import { RegistryProvider } from "@effect/atom-react";
import { Navigate, useLocation, useParams } from "react-router";
import { RecipeBuilder } from "~/components/recipe-builder/recipe-builder";

export default function BuilderRoute() {
  const { concept } = useParams();
  const { search, hash } = useLocation();
  if (
    concept &&
    ["quick-start", "guided", "live", "live-cards", "live-inline"].includes(
      concept,
    )
  )
    return <Navigate replace to={{ pathname: "/builder", search, hash }} />;
  if (concept !== undefined) {
    throw new Response("Builder version not found", { status: 404 });
  }
  return (
    <RegistryProvider>
      <RecipeBuilder />
    </RegistryProvider>
  );
}
