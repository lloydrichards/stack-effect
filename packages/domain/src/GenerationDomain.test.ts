import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { Blueprint } from "./Blueprint";
import {
  GenerationDomainAdapterId,
  GenerationDomainBinding,
  GenerationDomainId,
  GenerationDomainOptionId,
  GenerationDomainSelection,
  ModuleId,
  TargetKey,
} from "./Catalog";
import { Plan } from "./Plan";
import { Selection } from "./Selection";

const domain = new GenerationDomainSelection({
  id: GenerationDomainId.make("deployment"),
  option: GenerationDomainOptionId.make("fixture"),
});
const binding = new GenerationDomainBinding({
  domainId: domain.id,
  optionId: domain.option,
  targetId: TargetKey.make("apps/client-react-web"),
  adapterId: GenerationDomainAdapterId.make("fixture-react"),
});

describe("generation domain contracts", () => {
  it("keeps domain intent optional for backward compatibility", () => {
    expect(Schema.decodeSync(Selection)({ targets: [] })).toEqual({
      targets: [],
    });
    expect(
      Schema.decodeSync(Blueprint)({ nodes: [], edges: [] }).domainBindings,
    ).toBeUndefined();
    expect(
      Schema.decodeSync(Plan)({ outcomes: [], conflicts: [] })
        .generationDomains,
    ).toBeUndefined();
  });

  it("round-trips provider-neutral selection, binding, and Plan metadata", () => {
    expect(
      Schema.decodeSync(Selection)({ targets: [], domains: [domain] }).domains,
    ).toEqual([domain]);
    expect(
      Schema.decodeSync(Blueprint)({
        nodes: [],
        edges: [],
        domainBindings: [binding],
      }).domainBindings,
    ).toEqual([binding]);
    expect(
      Schema.decodeSync(Plan)({
        outcomes: [],
        conflicts: [],
        generationDomains: [{ selection: domain, bindings: [binding] }],
      }).generationDomains,
    ).toEqual([{ selection: domain, bindings: [binding] }]);
  });

  it("rejects duplicate generation-domain selections", () => {
    expect(() =>
      Schema.decodeSync(Selection)({ targets: [], domains: [domain, domain] }),
    ).toThrow(/unique/);
  });

  it("retains module identities in adapter policy", () => {
    expect(ModuleId.make("client-react-web-worker")).toBe(
      "client-react-web-worker",
    );
  });
});
