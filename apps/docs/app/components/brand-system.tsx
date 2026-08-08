import { Check, Layers3, Play, Search } from "lucide-react";

import {
  typefaceHeading1,
  typefaceHeading2,
  typefaceHeading3,
  typefaceHeading4,
  typefaceHeading5,
  typefaceHeading6,
} from "~/components/tokens/typeface";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Separator } from "~/components/ui/separator";

const tokenGroups = [
  {
    name: "Foundation",
    tokens: [
      ["Background", "--background", "bg-background"],
      ["Foreground", "--foreground", "bg-foreground"],
      ["Card", "--card", "bg-card"],
      ["Popover", "--popover", "bg-popover"],
      ["Border", "--border", "bg-border"],
      ["Input", "--input", "bg-input"],
    ],
  },
  {
    name: "Interaction",
    tokens: [
      ["Primary", "--primary", "bg-primary"],
      ["Primary ink", "--primary-foreground", "bg-primary-foreground"],
      ["Secondary", "--secondary", "bg-secondary"],
      ["Muted", "--muted", "bg-muted"],
      ["Accent", "--accent", "bg-accent"],
      ["Focus ring", "--ring", "bg-ring"],
    ],
  },
  {
    name: "Semantic",
    tokens: [
      ["Success", "--success", "bg-success"],
      ["Warning", "--warning", "bg-warning"],
      ["Destructive", "--destructive", "bg-destructive"],
      ["Info", "--info", "bg-info"],
      ["Muted ink", "--muted-foreground", "bg-muted-foreground"],
      ["Accent ink", "--accent-foreground", "bg-accent-foreground"],
    ],
  },
  {
    name: "Code and data",
    tokens: [
      ["Inline code", "--code", "bg-code"],
      ["Code block", "--code-block", "bg-code-block"],
      ["Chart 1", "--chart-1", "bg-chart-1"],
      ["Chart 2", "--chart-2", "bg-chart-2"],
      ["Chart 3", "--chart-3", "bg-chart-3"],
      ["Chart 4", "--chart-4", "bg-chart-4"],
      ["Chart 5", "--chart-5", "bg-chart-5"],
    ],
  },
];

const typeScale = [
  ["Heading 1", "2.488rem / 700", typefaceHeading1()],
  ["Heading 2", "2.074rem / 700", typefaceHeading2()],
  ["Heading 3", "1.728rem / 600", typefaceHeading3()],
  ["Heading 4", "1.44rem / 600", typefaceHeading4()],
  ["Heading 5", "1.2rem / 500", typefaceHeading5()],
  ["Heading 6", "1rem / 500", typefaceHeading6()],
];

function Plate({
  title,
  code,
  children,
}: {
  title: string;
  code: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-md border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-heading text-sm font-semibold">{title}</h3>
        <code className="rounded-sm border bg-code px-1.5 py-0.5 font-mono text-xs text-code-foreground">
          {code}
        </code>
      </div>
      {children}
    </section>
  );
}

export function BrandHeader() {
  return (
    <div className="my-7 flex flex-col gap-5 rounded-md border bg-card p-6">
      <div className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-primary">
        <Layers3 aria-hidden="true" />
        Spectral Signal · Precision Mono
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <p className="max-w-xl font-heading text-[1.728rem] font-semibold leading-[1.25] tracking-[-0.015em]">
          Stack Effect theme catalog
        </p>
        <div className="flex gap-2">
          <Button size="sm">
            <Play data-icon="inline-start" aria-hidden="true" />
            Apply plan
          </Button>
          <Button size="sm" variant="outline">
            Inspect
          </Button>
        </div>
      </div>
    </div>
  );
}

export function TokenCatalog() {
  return (
    <div className="my-6 flex flex-col gap-8">
      {tokenGroups.map((group) => (
        <section key={group.name} className="flex flex-col gap-3">
          <h3 className="font-heading text-sm font-semibold">{group.name}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {group.tokens.map(([name, variable, className]) => (
              <div
                key={variable}
                className="overflow-hidden rounded-sm border bg-card"
              >
                <div className={`h-16 border-b ${className}`} />
                <div className="p-3">
                  <p className="text-xs font-medium">{name}</p>
                  <code className="mt-1 block font-mono text-xs text-muted-foreground">
                    {variable}
                  </code>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function TypographyCatalog() {
  return (
    <div className="my-6 overflow-hidden rounded-md border bg-card">
      {typeScale.map(([name, value, className], index) => (
        <div key={name}>
          {index > 0 ? <Separator /> : null}
          <div className="grid gap-2 p-5 md:grid-cols-[9rem_1fr] md:items-baseline">
            <div>
              <p className="text-xs font-medium">{name}</p>
              <code className="font-mono text-xs text-muted-foreground">
                {value}
              </code>
            </div>
            <p className={className}>Compose with confidence.</p>
          </div>
        </div>
      ))}
      <Separator />
      <div className="grid gap-2 p-5 md:grid-cols-[9rem_1fr] md:items-baseline">
        <div>
          <p className="text-xs font-medium">Body</p>
          <code className="font-mono text-xs text-muted-foreground">
            1rem / 1.7
          </code>
        </div>
        <p>
          Readable technical prose stays sans-serif and within a 72ch measure.
        </p>
      </div>
    </div>
  );
}

export function ComponentCatalog() {
  return (
    <div className="my-6 grid gap-4 md:grid-cols-2">
      <Plate title="Button variants" code='<Button variant="…" />'>
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
        </div>
      </Plate>

      <Plate title="Button sizes" code='<Button size="sm" />'>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="xs">Extra small</Button>
          <Button size="sm">Small</Button>
          <Button>Default</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" aria-label="Search">
            <Search aria-hidden="true" />
          </Button>
        </div>
      </Plate>

      <Plate title="Input states" code="<Input aria-invalid />">
        <div className="grid gap-3">
          <Input
            aria-label="Default project name"
            defaultValue="my-effect-app"
          />
          <Input
            aria-label="Disabled package manager"
            defaultValue="bun"
            disabled
          />
          <Input
            aria-label="Invalid project name"
            defaultValue="invalid/name"
            aria-invalid
          />
        </div>
      </Plate>

      <Plate title="Status rows" code="bg-success · bg-warning">
        <div className="grid gap-2">
          {[
            ["bg-success", "Blueprint resolved"],
            ["bg-warning", "Conflict needs a decision"],
            ["bg-destructive", "Apply failed"],
            ["bg-info", "Dry run — no files written"],
          ].map(([className, label]) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-sm border bg-background p-3"
            >
              <span
                className={`size-2.5 rounded-full ${className}`}
                aria-hidden="true"
              />
              <span className="text-sm">{label}</span>
            </div>
          ))}
        </div>
      </Plate>

      <Plate title="Code surface" code="bg-code-block · rounded-sm">
        <pre className="overflow-x-auto rounded-sm border border-code-block-border bg-code-block p-4 font-mono text-xs text-code-block-foreground">
          <code>
            <span className="text-primary">●</span> Selection resolved{"\n"}
            Blueprint · 6 modules{"\n"}
            Plan · 18 files
          </code>
        </pre>
      </Plate>

      <Plate title="Compact result" code="border · bg-card · rounded-md">
        <div className="overflow-hidden rounded-md border bg-background">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <Check className="text-primary" aria-hidden="true" />
            <span className="text-sm font-medium">Plan ready</span>
            <span className="ml-auto font-mono text-xs text-muted-foreground">
              18 files
            </span>
          </div>
          <div className="flex justify-end gap-2 p-3">
            <Button size="sm" variant="outline">
              Inspect
            </Button>
            <Button size="sm">Apply</Button>
          </div>
        </div>
      </Plate>
    </div>
  );
}

export function RulesCatalog() {
  const rules = [
    ["Signal", "Primary marks action, focus, active location, or execution."],
    [
      "Shape",
      "rounded-sm controls · rounded-md containers · pills for status only.",
    ],
    [
      "Depth",
      "Tonal surfaces and borders first; no ambient dark-mode shadows.",
    ],
    ["Color", "Use semantic tokens in components; never paste palette values."],
  ];

  return (
    <div className="my-6 grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-2">
      {rules.map(([name, detail]) => (
        <div key={name} className="bg-card p-4">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.06em] text-primary">
            {name}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
        </div>
      ))}
    </div>
  );
}
