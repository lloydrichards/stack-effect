import { Layer } from "effect";
import { Atom } from "effect/reactivity";

// NOTE: Modules append additional runtime layers through Layer.mergeAll.
const RuntimeLayer = Layer.mergeAll(Layer.empty);

export const runtime = Atom.runtime(RuntimeLayer);
