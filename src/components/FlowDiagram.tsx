import type { ProjectFlow } from '../types';

interface FlowDiagramProps {
  flow: ProjectFlow;
}

const GAP_X = 24;
const GAP_Y = 22;
const HEAD_H = 30;
const PAD = 8;
/** Left inset for the step number, and the space kept clear on the right. */
const TEXT_X = 24;
const TEXT_RIGHT = 12;
const LINE_H = 13;
const BOX_MIN_H = 46;
const LANE_MIN = 150;
const LANE_MAX = 300;

/**
 * Rough advance widths for the two type sizes the boxes use — 10.5px semibold labels and
 * 8.5px monospace refs.
 *
 * Measuring properly would mean rendering into a canvas or reading getBBox after paint, and
 * both make the layout depend on when it ran. An estimate that errs wide keeps the text
 * inside the box, which is the only thing this has to get right.
 */
const LABEL_CH = 6.5;
const REF_CH = 5.2;

const labelWidth = (text: string) => text.length * LABEL_CH;
const refWidth = (text: string) => text.length * REF_CH;

/** Refs are single identifiers, so they clamp rather than wrap. */
const clampRef = (text: string, width: number) => {
  if (refWidth(text) <= width) return text;
  return `${text.slice(0, Math.max(1, Math.floor(width / REF_CH) - 1))}…`;
};

/** Greedy wrap by words, to at most `max` lines; the last line keeps whatever is left. */
function wrap(text: string, width: number, max = 2): string[] {
  if (labelWidth(text) <= width) return [text];
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (labelWidth(candidate) > width && line && lines.length < max - 1) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  lines.push(line);
  // A single unbreakable word — a long identifier, typically — cannot be wrapped, so clamp
  // it rather than let it run past the box. The tooltip still carries the whole label.
  return lines.slice(0, max).map((entry) => {
    if (labelWidth(entry) <= width) return entry;
    const fits = Math.max(1, Math.floor(width / LABEL_CH) - 1);
    return `${entry.slice(0, fits)}…`;
  });
}

/**
 * One flow as lanes and ordered steps: each step sits in the lane of whatever performs it,
 * and the arrows follow the order they happen in. That is what makes a hand-off visible —
 * "the client asks, the API answers, the client redirects" is three lanes and two crossings.
 *
 * Lanes are as wide as their own content rather than a fixed size: these labels are function
 * and endpoint names read out of real code, and a lane sized for the average one clips the
 * long ones. Past `LANE_MAX` the label wraps to a second line instead of widening further,
 * so one long step cannot stretch the whole diagram.
 *
 * Elbow connectors rather than curves: between two lanes a right angle says "the same step
 * moved sideways", where a bezier suggests something smoother than a network call.
 */
export const FlowDiagram = ({ flow }: FlowDiagramProps) => {
  const lanes = flow.actors;

  // Each lane is sized by the widest thing in it — its own steps, and its heading.
  const laneWidths = lanes.map((lane) => {
    const own = flow.steps.filter((step) => step.actor === lane.id);
    const widest = Math.max(
      labelWidth(lane.label),
      ...own.map((step) =>
        Math.max(labelWidth(step.label), refWidth(step.ref ?? step.note ?? '')),
      ),
      0,
    );
    return Math.min(LANE_MAX, Math.max(LANE_MIN, widest + TEXT_X + TEXT_RIGHT));
  });

  const laneX = new Map<string, number>();
  let cursor = PAD;
  lanes.forEach((lane, i) => {
    laneX.set(lane.id, cursor);
    cursor += laneWidths[i] + GAP_X;
  });
  const width = cursor - GAP_X + PAD;

  const laneWidth = (actor: string) => {
    const index = lanes.findIndex((lane) => lane.id === actor);
    return laneWidths[index === -1 ? 0 : index];
  };

  // Boxes are laid out top to bottom, and a wrapped label makes its own row taller.
  let y = HEAD_H;
  const placed = flow.steps.map((step) => {
    const x = laneX.get(step.actor) ?? PAD;
    const w = laneWidth(step.actor);
    const lines = wrap(step.label, w - TEXT_X - TEXT_RIGHT);
    const h = BOX_MIN_H + (lines.length - 1) * LINE_H;
    const box = { step, x, y, w, h, lines, cx: x + w / 2 };
    y += h + GAP_Y;
    return box;
  });
  const height = y - GAP_Y + PAD;

  return (
    <div className="flow-diagram" tabIndex={0} aria-label="Flow diagram, scrolls sideways">
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
          <marker
            id={`arrow-${flow.id}`}
            viewBox="0 0 8 8"
            refX="6"
            refY="4"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 1 L 6 4 L 0 7 z" className="flow-arrow-head" />
          </marker>
        </defs>

        {lanes.map((lane, i) => (
          <text
            key={lane.id}
            x={(laneX.get(lane.id) ?? 0) + laneWidths[i] / 2}
            y={14}
            className="flow-lane"
          >
            {lane.label}
          </text>
        ))}

        {placed.slice(0, -1).map((from, i) => {
          const to = placed[i + 1];
          const y1 = from.y + from.h;
          const y2 = to.y;
          const mid = y1 + GAP_Y / 2;
          const path =
            from.cx === to.cx
              ? `M ${from.cx} ${y1} L ${to.cx} ${y2}`
              : `M ${from.cx} ${y1} L ${from.cx} ${mid} L ${to.cx} ${mid} L ${to.cx} ${y2}`;
          return (
            <path
              key={`${from.step.id}->${to.step.id}`}
              d={path}
              className="flow-edge"
              markerEnd={`url(#arrow-${flow.id})`}
            />
          );
        })}

        {placed.map((box, i) => {
          const { step, x, w, h, lines } = box;
          const detail = step.ref ?? step.note;
          return (
            <g key={step.id} className="flow-step">
              <title>{detail ? `${step.label} — ${detail}` : step.label}</title>
              <rect x={x} y={box.y} width={w} height={h} rx={7} />
              <text x={x + 9} y={box.y + 17} className="flow-step-index">
                {i + 1}
              </text>
              {lines.map((line, at) => (
                <text
                  key={line}
                  x={x + TEXT_X}
                  y={box.y + 17 + at * LINE_H}
                  className="flow-step-label"
                >
                  {line}
                </text>
              ))}
              {detail && (
                <text
                  x={x + TEXT_X}
                  y={box.y + 16 + lines.length * LINE_H + 3}
                  className="flow-step-ref"
                >
                  {clampRef(detail, w - TEXT_X - TEXT_RIGHT)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
