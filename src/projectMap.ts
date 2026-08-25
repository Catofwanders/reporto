import type { InfraNode, ProjectMap } from './types';

/** Client for the hand-written map. Dev-server only; a static build has no API. */
export async function fetchProjectMap(): Promise<ProjectMap> {
  const res = await fetch('/api/projects', { cache: 'no-store' });
  if (!res.headers.get('content-type')?.includes('json')) {
    throw new Error('no /api/projects — is the dev server running?');
  }
  const body = (await res.json()) as ProjectMap & { error?: string };
  if (!res.ok || body.error) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

export interface PlacedNode extends InfraNode {
  x: number;
  y: number;
}

export interface Placement {
  nodes: PlacedNode[];
  edges: { from: PlacedNode; to: PlacedNode }[];
  width: number;
  height: number;
  /** Label position per layer, for the row captions. */
  rows: { layer: string; y: number }[];
}

const NODE_W = 132;
const NODE_H = 44;
const GAP_X = 26;
const GAP_Y = 62;
const PAD = 12;

/**
 * Layered top-to-bottom layout: one row per layer, nodes spread evenly across it.
 *
 * Deliberately not a graph-layout library. The map is hand-written and small, the layer of
 * every node is stated rather than inferred, and a force layout would move things between
 * renders — which is the one thing a diagram you read every day must not do.
 */
export function placeNodes(map: ProjectMap): Placement {
  const { layers, nodes, edges } = map.infra;
  const widest = Math.max(...layers.map((layer) => nodes.filter((n) => n.layer === layer).length), 1);
  const width = PAD * 2 + widest * NODE_W + (widest - 1) * GAP_X;

  const placed: PlacedNode[] = [];
  const rows: { layer: string; y: number }[] = [];

  layers.forEach((layer, row) => {
    const inRow = nodes.filter((node) => node.layer === layer);
    const rowWidth = inRow.length * NODE_W + (inRow.length - 1) * GAP_X;
    const startX = (width - rowWidth) / 2;
    const y = PAD + row * (NODE_H + GAP_Y);
    rows.push({ layer, y });
    inRow.forEach((node, i) => {
      placed.push({ ...node, x: startX + i * (NODE_W + GAP_X), y });
    });
  });

  const byId = new Map(placed.map((node) => [node.id, node]));
  return {
    nodes: placed,
    // An edge naming a node that is not on the map is dropped rather than drawn to nowhere.
    edges: edges
      .map(([from, to]) => ({ from: byId.get(from), to: byId.get(to) }))
      .filter((edge): edge is { from: PlacedNode; to: PlacedNode } => Boolean(edge.from && edge.to)),
    width,
    height: PAD * 2 + layers.length * NODE_H + (layers.length - 1) * GAP_Y,
    rows,
  };
}

export const NODE_SIZE = { width: NODE_W, height: NODE_H };
