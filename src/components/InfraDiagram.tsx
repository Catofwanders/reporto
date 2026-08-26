import { useState } from 'react';
import type { InfraSystem } from '../types';
import { NODE_SIZE, placeNodes } from '../projectMap';

interface InfraDiagramProps {
  system: InfraSystem;
}

/**
 * What talks to what, one row per layer.
 *
 * Edges leave the bottom of a box and enter the top of the next, curved just enough to tell
 * two crossing lines apart. Inline SVG rather than a diagramming dependency: the map is a
 * dozen nodes, the positions are stated rather than solved, and the whole thing has to
 * follow the palette tokens like everything else on the page.
 */
export const InfraDiagram = ({ system }: InfraDiagramProps) => {
  /**
   * Which node the pointer is on. A domain model runs to dozens of edges, and following one
   * entity's relationships by eye through that is hopeless — so hovering one dims everything
   * it does not touch. Nothing is hidden, only quietened.
   */
  const [focus, setFocus] = useState<string | null>(null);
  const { nodes, edges, width, height, rows } = placeNodes(system);
  const { width: w, height: h } = NODE_SIZE;
  // The gutter holds the layer captions, and those are as long as the domain needs them to
  // be — a fixed one clipped the longest caption to two thirds of its width.
  const labelGutter = Math.max(
    96,
    Math.ceil(Math.max(...system.layers.map((layer) => layer.length)) * 5.6) + 14,
  );

  /** A node is in focus if it is the hovered one or shares an edge with it. */
  const touches = (id: string) =>
    id === focus ||
    edges.some(
      (edge) =>
        (edge.from.id === focus && edge.to.id === id) ||
        (edge.to.id === focus && edge.from.id === id),
    );

  return (
    <div className={`infra${focus ? ' has-focus' : ''}`}>
      <svg
        // Natural size, not stretched: a 132px box scaled to the panel width reads as a
        // billboard, and the diagram should look the same on every screen.
        width={width + labelGutter}
        height={height}
        viewBox={`${-labelGutter} 0 ${width + labelGutter} ${height}`}
        className="infra-plot"
        role="img"
        aria-label={`${system.title}: ${system.layers
          .map((layer) => `${layer} — ${nodes.filter((n) => n.layer === layer).map((n) => n.label).join(', ')}`)
          .join('; ')}`}
      >
        {rows.map((row) => (
          <text key={row.layer} x={-labelGutter + 4} y={row.y + h / 2 + 4} className="infra-layer">
            {row.layer}
          </text>
        ))}

        {edges.map((edge) => {
          const x1 = edge.from.x + w / 2;
          const y1 = edge.from.y + h;
          const x2 = edge.to.x + w / 2;
          const y2 = edge.to.y;
          const mid = (y1 + y2) / 2;
          return (
            <path
              key={`${edge.from.id}->${edge.to.id}`}
              d={`M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`}
              className={`infra-edge${
                focus && (edge.from.id === focus || edge.to.id === focus) ? ' is-lit' : ''
              }`}
            />
          );
        })}

        {nodes.map((node) => (
          <g
            key={node.id}
            className={`infra-node${
              focus && !touches(node.id) ? ' is-dim' : focus === node.id ? ' is-focus' : ''
            }`}
            onMouseEnter={() => setFocus(node.id)}
            onMouseLeave={() => setFocus(null)}
          >
            <title>{node.note ? `${node.label} — ${node.note}` : node.label}</title>
            <rect x={node.x} y={node.y} width={w} height={h} rx={8} />
            <text x={node.x + w / 2} y={node.y + (node.note ? 19 : 26)} className="infra-label">
              {node.label}
            </text>
            {node.note && (
              <text x={node.x + w / 2} y={node.y + 32} className="infra-note">
                {node.note}
              </text>
            )}
          </g>
        ))}
      </svg>
      {system.note && <p className="panel-foot">{system.note}</p>}

      {system.notes && system.notes.length > 0 && (
        <ul className="arch-list">
          {system.notes.map((fact) => (
            <li key={fact.label}>
              <strong>{fact.label}</strong>
              {fact.detail && <span>{fact.detail}</span>}
              {fact.ref && <code>{fact.ref}</code>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
