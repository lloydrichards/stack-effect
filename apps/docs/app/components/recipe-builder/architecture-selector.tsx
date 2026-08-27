import { useSelector } from "@tanstack/react-form";
import { DisclosurePanel } from "~/components/molecules/disclosure-panel";
import { useRecipeBuilderFormContext } from "./recipe-builder-context";

export function ArchitectureSelector() {
  const form = useRecipeBuilderFormContext();
  const architecture = useSelector(
    form.store,
    (state) => state.values.architecture,
  );
  const select = (next: "classic" | "ddd") => {
    form.setFieldValue("architecture", next);
    if (next === "ddd") form.setFieldValue("database", "none");
  };

  return (
    <DisclosurePanel
      title="Architecture"
      description="Choose the application architecture before databases and targets."
      defaultOpen
    >
      <fieldset className="grid gap-3 p-4 md:grid-cols-2 md:p-5">
        <label className="flex cursor-pointer gap-3 rounded-md border p-4">
          <input
            type="radio"
            name="architecture"
            checked={architecture === "classic"}
            onChange={() => select("classic")}
          />
          <span>
            <strong className="block">Classic</strong>
            <span className="text-sm text-muted-foreground">
              Compose any supported targets, modules, and SQL provider.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer gap-3 rounded-md border p-4">
          <input
            type="radio"
            name="architecture"
            checked={architecture === "ddd"}
            onChange={() => select("ddd")}
          />
          <span>
            <strong className="block">Domain-Driven Design</strong>
            <span className="text-sm text-muted-foreground">
              Selectable Todo HTTP modules on server/api.
            </span>
          </span>
        </label>
      </fieldset>
      {architecture === "ddd" ? (
        <div className="space-y-2 border-t p-4 text-sm md:p-5">
          <strong className="block">Todo HTTP · server/api</strong>
          <p className="text-muted-foreground">
            Memory is always included and is the default. SQLite and PostgreSQL
            are optional additive selections.
          </p>
          <p className="font-mono text-xs">
            apps/server-api · packages/shared/domain · packages/todo/domain ·
            packages/todo/application · packages/todo/infrastructure ·
            packages/todo/presentation
          </p>
          <p className="text-muted-foreground">
            One host, Shared Domain, and four Todo context packages; HTTP only.
          </p>
        </div>
      ) : null}
    </DisclosurePanel>
  );
}
