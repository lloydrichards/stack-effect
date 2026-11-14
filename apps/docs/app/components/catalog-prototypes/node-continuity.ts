import type { CanvasLayout, CanvasNode } from "./layout";
import type { ForceBody } from "./organic-forces";

/** Match a promoted/demoted module to its departing node without stealing another target's copy. */
export const previousNodeBody = (
  node: CanvasNode,
  layout: CanvasLayout,
  previous: ReadonlyMap<string, ForceBody>,
) =>
  previous.get(node.id) ??
  (node.moduleId &&
  layout.nodes.find(
    (candidate) =>
      candidate.moduleId === node.moduleId && !previous.has(candidate.id),
  )?.id === node.id
    ? [...previous.values()].find(
        (body) =>
          body.node?.moduleId === node.moduleId &&
          !layout.nodes.some((candidate) => candidate.id === body.id),
      )
    : undefined);

export const continuingNodes = (
  layout: CanvasLayout,
  previous: ReadonlyMap<string, ForceBody>,
) =>
  layout.nodes.map((node): CanvasNode => {
    const body = previousNodeBody(node, layout, previous);
    return body
      ? {
          ...node,
          visualId: body.visualId,
          x: body.x - node.width / 2,
          y: body.y - node.height / 2,
          discovery: body.discovery?.tier,
        }
      : node;
  });
