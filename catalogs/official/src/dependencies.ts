// Effect packages release together, so every `effect` and `@effect/*` pin uses
// this version. Target seed manifests write it literally: a seed is a default
// for new targets, while a module's pin is a requirement on existing ones.
// The templates test checks that both agree.
export const EFFECT_VERSION = "4.1.4";
