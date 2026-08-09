"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clipboard,
  Layers3,
  RotateCcw,
} from "lucide-react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import { AnsiTerminal } from "~/components/ansi-terminal";
import { Button } from "~/components/ui/button";
import {
  type CopyStatus as CopyStatusValue,
  useCopyToClipboard,
} from "~/hooks/use-copy-to-clipboard";
import { cn } from "~/lib/utils";

const steps = ["Selection", "Blueprint", "Apply preview", "Finalize"] as const;
type Step = (typeof steps)[number];
type Recipe = {
  id: string;
  label: string;
  summary: string;
  project: string;
  target: string;
  createCommand: string;
  blueprint: string;
  apply: string;
  finalize: string;
  totals: string;
};

const reset = "\u001b[0m";
const bold = "\u001b[1m";
const dim = "\u001b[2m";
const cyan = "\u001b[1;36m";
const green = "\u001b[32m";
const yellow = "\u001b[33m";

const workspaceBlueprint = `${bold}- . (workspace)${reset}
  ├╌> .#workspace-monorepo-turbo
  ├╌> .#workspace-quality-biome
  ├╌> .#workspace-test-vitest
  ╰╌> .#workspace-typescript-6`;

const blueprintSection = (tree: string) =>
  `${cyan}Blueprint${reset}\n\n${tree}`;

const applySection = (tree: string, totals: string) =>
  `${cyan}Apply${reset}\n\n${tree}\n\n  ${totals}`;

const finishSection = (command: string, commands: string) =>
  `${cyan}Create Command${reset}\n\n  ${bold}${command}${reset}\n\n${cyan}Finalize${reset}\n\n  ${bold}Install & Format${reset}\n${commands}\n\n${dim}No changes written.${reset}`;

const recipes = [
  {
    id: "chat",
    label: "AI chat",
    summary: "React chat with shared Effect RPC contracts.",
    project: "demo-chat",
    target: "client-react/web:client-react-chat",
    createCommand:
      "stack-effect create demo-chat --target client-react/web:client-react-chat --no-git",
    totals: "22 create · 2 modify · 7 skip",
    blueprint:
      blueprintSection(`${workspaceBlueprint}\n\n${bold}- apps/client-react-web (client-react)${reset}
  ├╌> apps/client-react-web#client-react-chat
  │   ├─> packages/domain#domain-chat-contracts ${dim}[required-module]${reset}
  │   ╰─> packages/domain ${dim}[required-target]${reset}
  ╰╌> apps/client-react-web#config-typescript-vite

${bold}- packages/domain (package)${reset}
  ╰╌> packages/domain#domain-chat-contracts`),
    apply: applySection(
      `${bold}.${reset}
├── ${bold}apps/client-react-web${reset}
│   ├── ${green}[+]${reset} src/components/chat-box.tsx
│   ├── ${green}[+]${reset} src/lib/atoms/chat-atom.ts
│   ╰── ${green}[+]${reset} src/lib/chat-rpc-client.ts
├── ${bold}packages/domain${reset}
│   ├── ${green}[+]${reset} src/Chat.ts
│   ╰── ${green}[+]${reset} src/ChatRpc.ts
├── ${yellow}[~]${reset} package.json
╰── ${dim}[=]${reset} turbo.json`,
      `${green}22 create${reset}  ${yellow}2 modify${reset}  ${dim}7 skip${reset}`,
    ),
    finalize: finishSection(
      "stack-effect create demo-chat --target client-react/web:client-react-chat --no-git",
      `  > bunx shadcn@latest add button card input
  > bun install
  > bun run lint
  > bun run format`,
    ),
  },
  {
    id: "api",
    label: "HTTP API",
    summary: "Typed HTTP API client with a shared Effect contract.",
    project: "demo-http",
    target: "client-react/web:client-react-http-api",
    createCommand:
      "stack-effect create demo-http --target client-react/web:client-react-http-api --no-git",
    totals: "20 create · 2 modify · 7 skip",
    blueprint:
      blueprintSection(`${workspaceBlueprint}\n\n${bold}- apps/client-react-web (client-react)${reset}
  ├╌> apps/client-react-web#client-react-http-api
  │   ├─> packages/domain#domain-api-contracts ${dim}[required-module]${reset}
  │   ╰─> packages/domain ${dim}[required-target]${reset}
  ╰╌> apps/client-react-web#config-typescript-vite

${bold}- packages/domain (package)${reset}
  ╰╌> packages/domain#domain-api-contracts`),
    apply: applySection(
      `${bold}.${reset}
├── ${bold}apps/client-react-web${reset}
│   ├── ${green}[+]${reset} src/components/rest-card.tsx
│   ╰── ${green}[+]${reset} src/lib/atoms/hello-atom.ts
├── ${bold}packages/domain${reset}
│   ╰── ${green}[+]${reset} src/Api.ts
├── ${yellow}[~]${reset} package.json
╰── ${dim}[=]${reset} turbo.json`,
      `${green}20 create${reset}  ${yellow}2 modify${reset}  ${dim}7 skip${reset}`,
    ),
    finalize: finishSection(
      "stack-effect create demo-http --target client-react/web:client-react-http-api --no-git",
      `  > bunx shadcn@latest add button card
  > bun install
  > bun run lint
  > bun run format`,
    ),
  },
  {
    id: "cli",
    label: "CLI chat",
    summary: "Terminal chat composed from Effect AI services.",
    project: "smoke-app",
    target: "cli/app:cli-command-chat-terminal",
    createCommand:
      "stack-effect create smoke-app --target cli/app:cli-command-chat-terminal --no-git",
    totals: "20 create · 1 modify · 8 skip",
    blueprint:
      blueprintSection(`${workspaceBlueprint}\n\n${bold}- apps/cli-app (cli)${reset}
  ├╌> apps/cli-app#cli-chat-driver
  │   ├─> packages/ai#package-ai-chat-service ${dim}[required-module]${reset}
  │   ├─> packages/domain#domain-chat-contracts ${dim}[required-module]${reset}
  │   ├─> packages/ai ${dim}[required-target]${reset}
  │   ╰─> packages/domain ${dim}[required-target]${reset}
  ├╌> apps/cli-app#cli-command-chat-terminal
  │   ╰─> apps/cli-app#cli-chat-driver ${dim}[required-module]${reset}
  ╰╌> apps/cli-app#cli-command-hello

${bold}- packages/ai (package)${reset}
  ├╌> packages/ai#package-ai-chat-service
  ├╌> packages/ai#package-ai-core
  ╰╌> packages/ai#package-ai-toolkit-think

${bold}- packages/domain (package)${reset}
  ╰╌> packages/domain#domain-chat-contracts`),
    apply: applySection(
      `${bold}.${reset}
├── ${bold}apps/cli-app${reset}
│   ├── ${green}[+]${reset} src/chat/ChatDriver.ts
│   ├── ${green}[+]${reset} src/chat/TerminalChat.ts
│   ╰── ${green}[+]${reset} src/commands/chat.ts
├── ${bold}packages/ai${reset}
│   ├── ${green}[+]${reset} src/services/AiChatService.ts
│   ╰── ${green}[+]${reset} src/toolkits/ThinkToolkit.ts
├── ${bold}packages/domain${reset}
│   ├── ${green}[+]${reset} src/Chat.ts
│   ╰── ${green}[+]${reset} src/ChatRpc.ts
├── ${yellow}[~]${reset} package.json
╰── ${dim}[=]${reset} turbo.json`,
      `${green}20 create${reset}  ${yellow}1 modify${reset}  ${dim}8 skip${reset}`,
    ),
    finalize: finishSection(
      "stack-effect create smoke-app --target cli/app:cli-command-chat-terminal --no-git",
      `  > bun install
  > bun run lint
  > bun run format`,
    ),
  },
] satisfies readonly [Recipe, ...Recipe[]];

const defaultRecipe = recipes[0];

export function BlueprintWorkbench() {
  const [recipeId, setRecipeId] = useState(defaultRecipe.id);
  const [stepIndex, setStepIndex] = useState(0);
  const {
    status: copyStatus,
    copy: copyCommand,
    reset: resetCopyStatus,
  } = useCopyToClipboard();
  const recipe = useMemo(
    () => recipes.find((item) => item.id === recipeId) ?? defaultRecipe,
    [recipeId],
  );
  const step = steps[stepIndex] ?? steps[0];
  const command = `bunx stack-effect@latest init ${recipe.project} --yes
cd ${recipe.project}
bunx stack-effect@latest add --dry-run`;

  const selectRecipe = useCallback(
    (id: string) => {
      setRecipeId(id);
      setStepIndex(0);
      resetCopyStatus();
    },
    [resetCopyStatus],
  );

  return (
    <section
      className="my-10 w-full min-w-0 max-w-full overflow-hidden rounded-md border bg-card shadow-sm"
      aria-labelledby="workbench-title"
    >
      <div className="grid border-b xl:grid-cols-[minmax(22rem,1fr)_minmax(34rem,40rem)] xl:items-stretch">
        <div className="min-w-0 p-5 md:p-7">
          <p className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-primary">
            <Layers3 aria-hidden="true" /> Interactive dry run
          </p>
          <h2
            id="workbench-title"
            className="mt-2 font-heading text-[1.44rem] font-semibold leading-[1.3] tracking-[-0.01em]"
          >
            See a selection become a repository.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Choose a recipe, then inspect the same dependency trees and file
            plan the CLI presents before it writes anything.
          </p>
        </div>
        <div className="grid min-w-0 gap-2 border-t p-4 md:grid-cols-3 xl:border-t-0 xl:border-l">
          {recipes.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              aria-pressed={candidate.id === recipe.id}
              onClick={() => selectRecipe(candidate.id)}
              className={cn(
                "min-w-0 rounded-sm border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:min-w-32",
                candidate.id === recipe.id
                  ? "border-primary bg-accent text-accent-foreground"
                  : "bg-background hover:bg-muted",
              )}
            >
              <span className="block text-sm font-medium">
                {candidate.label}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {candidate.summary}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="border-b lg:border-r lg:border-b-0">
          <div
            className="grid grid-cols-4 lg:block"
            aria-label="Composition lifecycle"
          >
            {steps.map((candidate, index) => (
              <button
                key={candidate}
                type="button"
                onClick={() => setStepIndex(index)}
                aria-current={candidate === step ? "step" : undefined}
                className={cn(
                  "min-h-11 w-full border-r px-2 py-3 text-left font-mono text-xs transition-colors last:border-r-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:px-3 lg:min-h-0 lg:border-r-0 lg:border-b lg:px-5 lg:py-4",
                  candidate === step
                    ? "bg-accent font-semibold text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span className="mr-2 hidden text-primary sm:inline">
                  0{index + 1}
                </span>
                {candidate}
              </button>
            ))}
          </div>
          <div className="hidden p-5 lg:block">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {recipe.summary}
            </p>
          </div>
        </div>

        <div className="min-w-0 p-4 md:p-6">
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {recipe.label}: {step}
          </p>
          <AnimatedHeight>
            <StepContent
              recipe={recipe}
              step={step}
              command={command}
              copyStatus={copyStatus}
              onCopy={copyCommand}
            />
          </AnimatedHeight>
          <div className="mt-4 flex items-center justify-between gap-3">
            <Button
              size="sm"
              variant="outline"
              className="px-3"
              onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
              disabled={stepIndex === 0}
            >
              <ArrowLeft data-icon="inline-start" aria-hidden="true" /> Previous
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="px-3"
              onClick={() => setStepIndex(0)}
              disabled={stepIndex === 0}
            >
              <RotateCcw data-icon="inline-start" aria-hidden="true" /> Restart
            </Button>
            <Button
              size="sm"
              className="px-3"
              onClick={() =>
                setStepIndex((index) => Math.min(steps.length - 1, index + 1))
              }
              disabled={stepIndex === steps.length - 1}
            >
              Next <ArrowRight data-icon="inline-end" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function AnimatedHeight({ children }: { children: React.ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;

    const measure = () => setHeight(content.getBoundingClientRect().height);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="overflow-hidden transition-[height] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
      style={{ height: height === undefined ? "auto" : height }}
    >
      <div ref={contentRef}>{children}</div>
    </div>
  );
}

function StepContent({
  recipe,
  step,
  command,
  copyStatus,
  onCopy,
}: {
  recipe: Recipe;
  step: Step;
  command: string;
  copyStatus: CopyStatusValue;
  onCopy: (value: string) => void;
}) {
  switch (step) {
    case "Selection":
      return (
        <SelectionStep
          recipe={recipe}
          command={command}
          copyStatus={copyStatus}
          onCopy={onCopy}
        />
      );
    case "Blueprint":
      return (
        <TerminalStep
          eyebrow="Dependency closure"
          title="Inspect the resolved Blueprint."
          detail="Required modules and targets stay visible, including why each dependency was added."
          terminalTitle="stack-effect · blueprint"
          output={recipe.blueprint}
        />
      );
    case "Apply preview":
      return (
        <TerminalStep
          eyebrow="Repository-aware plan"
          title="Preview what Apply would change."
          detail={`Plan compares the Blueprint with the repository. The CLI shows those outcomes under Apply: ${recipe.totals}. Dry run writes nothing.`}
          terminalTitle="stack-effect · apply preview"
          output={recipe.apply}
        />
      );
    case "Finalize":
      return (
        <TerminalStep
          eyebrow="Finalize report"
          title={`${recipe.label} is ready to create.`}
          detail={`${recipe.summary} Copy the reproducible command, then Finalize reports the install and formatting tasks that follow Apply.`}
          terminalTitle="stack-effect · finalize"
          output={recipe.finalize}
          copy={{
            status: copyStatus,
            value: recipe.createCommand,
            onCopy,
          }}
        />
      );
  }
}

function SelectionStep({
  recipe,
  command,
  copyStatus,
  onCopy,
}: {
  recipe: Recipe;
  command: string;
  copyStatus: CopyStatusValue;
  onCopy: (value: string) => void;
}) {
  return (
    <div>
      <StepHeading
        eyebrow="User intent"
        title="Select one capability."
        detail={`Run add --dry-run to choose through the interactive TUI. This walkthrough represents that choice with --target ${recipe.target} --yes so each recipe stays reproducible.`}
      />
      <div className="relative">
        <AnsiTerminal
          title="stack-effect · dry run"
          className="mt-5 mb-0"
          input={`${green}$${reset} bunx stack-effect@latest init ${recipe.project} --yes
${green}$${reset} cd ${recipe.project}
${green}$${reset} bunx stack-effect@latest add --dry-run

${dim}# Demo selection: --target ${bold}${recipe.target}${reset}${dim} --yes${reset}`}
        />
        <CopyCommandButton
          copiedLabel="Command copied"
          idleLabel="Copy command"
          status={copyStatus}
          onClick={() => onCopy(command)}
        />
        <span className="sr-only">{command}</span>
      </div>
      <CopyStatus status={copyStatus} />
    </div>
  );
}

function TerminalStep({
  eyebrow,
  title,
  detail,
  terminalTitle,
  output,
  copy,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  terminalTitle: string;
  output: string;
  copy?: {
    status: CopyStatusValue;
    value: string;
    onCopy: (value: string) => void;
  };
}) {
  return (
    <div>
      <StepHeading eyebrow={eyebrow} title={title} detail={detail} />
      <div className="relative">
        <AnsiTerminal
          title={terminalTitle}
          className="mt-5 mb-0"
          input={output}
        />
        {copy ? (
          <CopyCommandButton
            copiedLabel="Create command copied"
            idleLabel="Copy create command"
            status={copy.status}
            onClick={() => copy.onCopy(copy.value)}
          />
        ) : null}
      </div>
      {copy ? <CopyStatus status={copy.status} /> : null}
    </div>
  );
}

function CopyCommandButton({
  copiedLabel,
  idleLabel,
  status,
  onClick,
}: {
  copiedLabel: string;
  idleLabel: string;
  status: CopyStatusValue;
  onClick: () => void;
}) {
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      onClick={onClick}
      className="absolute top-0 right-0 sm:top-0.5 sm:right-2"
      aria-label={status === "copied" ? copiedLabel : idleLabel}
    >
      {status === "copied" ? (
        <Check aria-hidden="true" />
      ) : (
        <Clipboard aria-hidden="true" />
      )}
    </Button>
  );
}

function CopyStatus({ status }: { status: CopyStatusValue }) {
  return (
    <p
      role="status"
      className={cn(
        "mt-2 min-h-5 text-xs",
        status === "error" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {status === "copied"
        ? "Command copied."
        : status === "error"
          ? "Couldn’t copy. Select the command manually."
          : null}
    </p>
  );
}

function StepHeading({
  eyebrow,
  title,
  detail,
}: {
  eyebrow: string;
  title: string;
  detail: string;
}) {
  return (
    <div>
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.06em] text-primary">
        {eyebrow}
      </p>
      <h3 className="mt-1 font-heading text-[1.44rem] font-semibold leading-[1.3] tracking-[-0.01em]">
        {title}
      </h3>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}
