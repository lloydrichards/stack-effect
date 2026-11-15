import { LockKeyhole } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Checkbox } from "~/components/ui/checkbox";
import { cn } from "~/lib/utils";

export function ModuleRow({
  required,
  checked,
  disabled,
  onToggle,
  children,
  details,
  reason,
}: {
  required: boolean;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  children: ReactNode;
  details?: ReactNode;
  reason?: string | undefined;
}) {
  const id = useId();
  return (
    <>
      <div className="module-row relative flex min-h-8 items-center gap-x-1 py-1 text-sm/5">
        {required ? (
          <>
            <LockKeyhole
              aria-hidden="true"
              className="me-1 size-4 shrink-0 p-px text-muted-foreground"
            />
            <span className="min-w-0 wrap-anywhere text-muted-foreground">
              {children}
              <span className="sr-only"> (automatically included)</span>
            </span>
          </>
        ) : (
          <>
            <Checkbox
              className="me-1"
              id={id}
              checked={checked}
              disabled={disabled}
              aria-describedby={reason ? id + "-reason" : undefined}
              onCheckedChange={onToggle}
            />
            <label
              htmlFor={id}
              className={cn(
                "min-w-0 wrap-anywhere",
                disabled ? "text-muted-foreground" : "cursor-pointer",
              )}
            >
              {children}
            </label>
          </>
        )}
        {details}
      </div>
      {reason && (
        <p
          id={id + "-reason"}
          className="pb-1 pl-6 text-xs text-muted-foreground"
        >
          {reason}
        </p>
      )}
    </>
  );
}
