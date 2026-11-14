export const organicVariants = [
  {
    id: "ribbon",
    label: "A / Target ribbon",
    description: "One horizontal row · quiet labels",
    spacing: 1700,
    columns: 0,
    contextScale: 0.8,
    detailScale: 1.1,
    hubX: 0.09,
    hubY: 0.12,
    moduleX: 0.006,
  },
  {
    id: "bands",
    label: "B / Staggered islands",
    description: "Module relationships · targets in the panel",
    spacing: 1700,
    columns: 4,
    contextScale: 0.6,
    detailScale: 0.9,
    hubX: 0.07,
    hubY: 0.07,
    moduleX: 0.006,
  },
  {
    id: "lanes",
    label: "C / Soft target lanes",
    description: "Horizontal anchors · detail sooner",
    spacing: 1500,
    columns: 0,
    contextScale: 0.45,
    detailScale: 0.7,
    hubX: 0.12,
    hubY: 0.1,
    moduleX: 0.045,
  },
] as const;
export type OrganicVariant = (typeof organicVariants)[number]["id"];
export const variantConfig = (id: OrganicVariant) =>
  organicVariants.find((variant) => variant.id === id) ?? organicVariants[1];
export type DetailLevel = "map" | "names" | "context" | "detail";
export const detailLevel = (
  scale: number,
  variant: OrganicVariant,
): DetailLevel =>
  scale < 0.4
    ? "map"
    : scale >= variantConfig(variant).detailScale
      ? "detail"
      : scale >= variantConfig(variant).contextScale
        ? "context"
        : "names";
