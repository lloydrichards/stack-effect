import { Popover } from "@base-ui/react/popover";
import { Info } from "lucide-react";

export function ModuleDetails({
  title,
  description,
  target,
  requirement,
}: {
  title: string;
  description: string;
  target?: string;
  requirement?: "required" | "optional";
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        type="button"
        openOnHover
        aria-label={`Details for ${title}`}
        className="module-details-trigger inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Info aria-hidden="true" className="size-3.5" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="top"
          align="start"
          sideOffset={4}
          collisionPadding={8}
          className="z-50"
        >
          <Popover.Popup className="w-64 max-w-[var(--available-width)] space-y-1.5 rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-md">
            <Popover.Title className="font-medium">{title}</Popover.Title>
            <Popover.Description className="text-muted-foreground">
              {description}
            </Popover.Description>
            {target && (
              <p className="text-xs">
                <span className="capitalize">{requirement}</span> in{" "}
                <code className="break-all">{target}</code>
              </p>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
