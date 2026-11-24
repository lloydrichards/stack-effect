import { Effect, Schema } from "effect";

/** Whether a command asks at each prompt or takes the prompt's default. */
const Confirmation = Schema.Literals(["ask", "assume-yes"]);

export type Confirmation = typeof Confirmation.Type;

/** Which finalize scripts a write runs, and whether it asks first. */
const ScriptPolicy = Schema.Literals(["prompt", "official-only", "all"]);

export type ScriptPolicy = typeof ScriptPolicy.Type;

/** A scaffold either previews its changes or writes them. */
export const RunMode = Schema.TaggedUnion({
  preview: { showFiles: Schema.Boolean },
  write: { confirm: Confirmation, scripts: ScriptPolicy },
});

export type RunMode = typeof RunMode.Type;

export type PreviewMode = typeof RunMode.cases.preview.Type;

export type WriteMode = typeof RunMode.cases.write.Type;

// Without --trust, custom-catalog scripts need a person to opt in at the prompt.
const UNTRUSTED_SCRIPTS = {
  ask: "prompt",
  "assume-yes": "official-only",
} satisfies Record<Confirmation, ScriptPolicy>;

/** Decodes the shared scaffold switches once, at the command. */
export const decodeRunFlags = (flags: {
  dryRun: boolean;
  showFiles: boolean;
  yes: boolean;
  trust: boolean;
}): Effect.Effect<{ confirm: Confirmation; mode: RunMode }, string> => {
  const confirm = flags.yes ? "assume-yes" : "ask";

  if (flags.dryRun) {
    return Effect.succeed({
      confirm,
      mode: RunMode.cases.preview.make({ showFiles: flags.showFiles }),
    });
  }
  if (flags.showFiles) {
    return Effect.fail("--show-files requires --dry-run.");
  }
  return Effect.succeed({
    confirm,
    mode: RunMode.cases.write.make({
      confirm,
      scripts: flags.trust ? "all" : UNTRUSTED_SCRIPTS[confirm],
    }),
  });
};

/** Runs `prompt` when the command asks, otherwise takes `assumed`. */
export const askOr = <A, E, R>(
  confirm: Confirmation,
  prompt: Effect.Effect<A, E, R>,
  assumed: A,
): Effect.Effect<A, E, R> =>
  confirm === "ask" ? prompt : Effect.succeed(assumed);
