import { useEffect, useRef, useState } from "react";
import type { CanvasLayout } from "./layout";
import { continuingNodes } from "./node-continuity";
import { createOrganicWorld } from "./organic-forces";
import type { CatalogModel, SelectionProjection } from "./selection";

export function useOrganicSimulation(
  layout: CanvasLayout,
  model: CatalogModel,
  projection: SelectionProjection,
  enabled = true,
  focused = "",
) {
  const worldRef = useRef<ReturnType<typeof createOrganicWorld> | undefined>(
    undefined,
  );
  const previousCatalogY = useRef(layout.catalogY);
  const previousVariant = useRef(layout.variant);
  const [frame, setFrame] = useState<{
    key: CanvasLayout;
    snapshot: ReturnType<ReturnType<typeof createOrganicWorld>["snapshot"]>;
  }>();
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    if (!enabled) {
      worldRef.current?.simulations.forEach((simulation) => simulation.stop());
      worldRef.current = undefined;
      return;
    }
    const hasPrevious = Boolean(worldRef.current);
    const world = createOrganicWorld(
      layout,
      model,
      projection,
      previousVariant.current === layout.variant
        ? worldRef.current?.bodies
        : undefined,
      layout.catalogY - previousCatalogY.current,
    );
    previousCatalogY.current = layout.catalogY;
    previousVariant.current = layout.variant;
    worldRef.current?.simulations.forEach((simulation) => simulation.stop());
    worldRef.current = world;
    // Existing bodies start this frame exactly where they were; forces do the transition.
    if (!hasPrevious)
      world.simulations.forEach((simulation) => simulation.tick(45));
    const publish = () => setFrame({ key: layout, snapshot: world.snapshot() });
    publish();
    world.simulations.forEach((simulation) =>
      simulation.on("tick", publish).on("end", publish),
    );
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reducedMotion) {
      world.simulations.forEach((simulation) => simulation.tick(150));
      publish();
    } else if (!pausedRef.current)
      world.simulations.forEach((simulation) => simulation.restart());
    return () => {
      world.simulations.forEach((simulation) => simulation.stop());
    };
  }, [layout, model, projection, enabled, generation]);
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    world.focusDiscovery(focused);
    if (
      pausedRef.current ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      world.catalogSimulation.tick(150);
      setFrame({ key: layout, snapshot: world.snapshot() });
    } else world.catalogSimulation.restart();
  }, [focused, layout, generation]);
  const dragStart = (id: string) => {
    const world = worldRef.current,
      body = world?.bodies.get(id);
    if (!world || !body) return;
    body.fx = body.x;
    body.fy = body.y;
    if (
      !pausedRef.current &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      world.simulationFor(id).alphaTarget(0.25).restart();
  };
  const dragTo = (id: string, x: number, y: number) => {
    const world = worldRef.current,
      body = world?.bodies.get(id);
    if (!world || !body) return;
    body.fx = x;
    body.fy = y;
    body.x = body.fx;
    body.y = body.fy;
    setFrame({ key: layout, snapshot: world.snapshot() });
  };
  const dragEnd = (id: string) => {
    const world = worldRef.current,
      body = world?.bodies.get(id);
    if (!world || !body) return;
    // Moving a hub relocates its attractor. A module is released to its springs.
    if (body.status !== "catalog") {
      body.anchorX = body.x;
      body.anchorY = body.y;
    }
    body.fx = null;
    body.fy = null;
    world.simulationFor(id).alphaTarget(0);
    if (
      !pausedRef.current &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      world.simulationFor(id).tick(120);
      setFrame({ key: layout, snapshot: world.snapshot() });
      world.simulations.forEach((simulation) => simulation.stop());
    }
  };
  const togglePause = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    if (pausedRef.current)
      worldRef.current?.simulations.forEach((simulation) => simulation.stop());
    else
      worldRef.current?.simulations.forEach((simulation) =>
        simulation.alpha(0.45).restart(),
      );
  };
  const reset = () => {
    worldRef.current?.simulations.forEach((simulation) => simulation.stop());
    worldRef.current = undefined;
    setGeneration((value) => value + 1);
  };
  return {
    ready: frame?.key === layout,
    nodes:
      frame?.key === layout
        ? frame.snapshot.nodes
        : continuingNodes(
            layout,
            previousVariant.current === layout.variant
              ? (worldRef.current?.bodies ?? new Map())
              : new Map(),
          ),
    hubs:
      frame?.key === layout
        ? frame.snapshot.hubs
        : layout.groups.map((group) => ({ ...group, id: `hub:${group.kind}` })),
    bonds: worldRef.current?.bonds ?? [],
    dragStart,
    dragTo,
    dragEnd,
    paused,
    togglePause,
    reset,
  };
}
