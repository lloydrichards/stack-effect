import { Exit, Schema } from "effect";
import {
  type BuilderCatalogOutputWire as BuilderCatalogOutput,
  BuilderCatalogOutputWire,
  type BuilderCatalogRequestWire,
  type RecipePreviewInputWire,
  type RecipePreviewOutputWire as RecipePreviewOutput,
  RecipePreviewOutputWire,
} from "./recipe-preview-protocol";

type PreviewInput = RecipePreviewInputWire;
type PreviewOutput = RecipePreviewOutput;

type PreviewResponse =
  | {
      readonly _tag: "success";
      readonly id: string;
      readonly output: unknown;
    }
  | {
      readonly _tag: "failure";
      readonly id: string;
      readonly message: string;
    };

type PendingPreview = {
  readonly resolve: (output: unknown) => void;
  readonly reject: (error: Error) => void;
};

export class RecipePreviewClient {
  #worker: Worker;
  readonly #pending = new Map<string, PendingPreview>();
  #nextId = 0;

  constructor() {
    this.#worker = this.#createWorker();
  }

  #createWorker(): Worker {
    const worker = new Worker(
      new URL("./recipe-preview.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.addEventListener(
      "message",
      (event: MessageEvent<PreviewResponse>) => {
        const response = event.data;
        const pending = this.#pending.get(response.id);
        if (pending === undefined) return;
        this.#pending.delete(response.id);

        if (response._tag === "failure") {
          pending.reject(new Error(response.message));
          return;
        }

        pending.resolve(response.output);
      },
    );
    worker.addEventListener("error", () => this.#recoverWorker());
    worker.addEventListener("messageerror", () => this.#recoverWorker());
    return worker;
  }

  #recoverWorker(): void {
    this.#worker.terminate();
    for (const pending of this.#pending.values()) {
      pending.reject(new Error("The preview worker stopped unexpectedly."));
    }
    this.#pending.clear();
    this.#worker = this.#createWorker();
  }

  preview(input: PreviewInput): Promise<PreviewOutput> {
    return this.#request("preview", input).then(
      (output): PreviewOutput =>
        Exit.match(Schema.decodeUnknownExit(RecipePreviewOutputWire)(output), {
          onFailure: (cause) => {
            throw new Error(String(cause));
          },
          onSuccess: (value) => value,
        }),
    );
  }

  catalog(input: BuilderCatalogRequestWire): Promise<BuilderCatalogOutput> {
    return this.#request("catalog", input).then(
      (output): BuilderCatalogOutput =>
        Exit.match(Schema.decodeUnknownExit(BuilderCatalogOutputWire)(output), {
          onFailure: (cause) => {
            throw new Error(String(cause));
          },
          onSuccess: (value) => value,
        }),
    );
  }

  #request(_tag: "preview" | "catalog", input: unknown): Promise<unknown> {
    const id = String(++this.#nextId);
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#worker.postMessage({ _tag, id, input });
    });
  }

  dispose(): void {
    this.#worker.terminate();
    for (const pending of this.#pending.values()) {
      pending.reject(new Error("The preview worker was disposed."));
    }
    this.#pending.clear();
  }
}
