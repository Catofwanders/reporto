import type { ProjectFlow } from '../types';

interface FlowDiagramProps {
  flow: ProjectFlow;
}

const LANE_W = 168;
const STEP_H = 46;
const GAP_Y = 22;
const HEAD_H = 30;
const PAD = 8;

/**
 * One flow as lanes and ordered steps: each step sits in the lane of whatever performs it,
 * and the arrows follow the order they happen in. That is what makes a hand-off visible —
 * "the client asks, the API answers, the client redirects" is three lanes and two crossings.
 *
 * Elbow connectors rather than curves: between two lanes a right angle says "the same step
 * moved sideways", where a bezier suggests something smoother than a network call.
 */
export const FlowDiagram = ({ flow }: FlowDiagramProps) => {
  const lanes = flow.actors;
  const laneX = new Map(lanes.map((lane, i) => [lane.id, PAD + i * LANE_W]));
  const width = PAD * 2 + lanes.length * LANE_W;
  const height = HEAD_H + PAD + flow.steps.length * (STEP_H + GAP_Y);
  const boxW = LANE_W - 24;

  const at = (index: number) => {
    const step = flow.steps[index];
    const x = laneX.get(step.actor) ?? PAD;
    return { x, y: HEAD_H + index * (STEP_H + GAP_Y), cx: x + boxW / 2 };
  };

  return (
    <div className="flow-diagram">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${flow.title}: ${flow.steps
          .map((step, i) => `${i + 1}. ${step.label} (${step.actor})`)
          .join('; ')}`}
      >
        <defs>
          <marker id={`arrow-${flow.id}`} viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 1 L 6 4 L 0 7 z" className="flow-arrow-head" />
          </marker>
        </defs>

        {lanes.map((lane) => (
          <text key={lane.id} x={(laneX.get(lane.id) ?? 0) + boxW / 2} y={14} className="flow-lane">
            {lane.label}
          </text>
        ))}

        {flow.steps.slice(0, -1).map((step, i) => {
          const from = at(i);
          const to = at(i + 1);
          const y1 = from.y + STEP_H;
          const y2 = to.y;
          const mid = y1 + GAP_Y / 2;
          const path =
            from.cx === to.cx
              ? `M ${from.cx} ${y1} L ${to.cx} ${y2}`
              : `M ${from.cx} ${y1} L ${from.cx} ${mid} L ${to.cx} ${mid} L ${to.cx} ${y2}`;
          return (
            <path
              key={`${step.id}->${flow.steps[i + 1].id}`}
              d={path}
              className="flow-edge"
              markerEnd={`url(#arrow-${flow.id})`}
            />
          );
        })}

        {flow.steps.map((step, i) => {
          const { x, y } = at(i);
          return (
            <g key={step.id} className="flow-step">
              <title>{step.ref ? `${step.label} — ${step.ref}` : step.label}</title>
              <rect x={x} y={y} width={boxW} height={STEP_H} rx={7} />
              <text x={x + 9} y={y + 17} className="flow-step-index">
                {i + 1}
              </text>
              <text x={x + 24} y={y + 17} className="flow-step-label">
                {step.label}
              </text>
              {(step.ref || step.note) && (
                <text x={x + 24} y={y + 33} className="flow-step-ref">
                  {step.ref ?? step.note}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
