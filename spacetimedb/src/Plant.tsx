import type { Stage } from './garden';

// Palette from cards/lib/render.js, plus the vein green from cards/public/leaf.png.
export const COLORS = {
  card: '#F4EADF',
  green: '#0B6122',
  barFill: '#4E8A5E',
  track: '#DCCBB2',
  ink: '#222222',
  primary: '#0A4D17',
  vein: '#A4D7A2',
};

const BASE_X = 40;
const BASE_Y = 86;

// A leaf pointing along +x from its stem attachment, rotated by `angle` degrees.
function Leaf({
  x,
  y,
  angle,
  length,
  width,
  fill = COLORS.green,
  vein = true,
}: {
  x: number;
  y: number;
  angle: number;
  length: number;
  width: number;
  fill?: string;
  vein?: boolean;
}) {
  const L = length;
  const W = width;
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <path
        d={`M0 0 C${L * 0.25} ${-W} ${L * 0.75} ${-W} ${L} 0 C${L * 0.75} ${W} ${L * 0.25} ${W} 0 0Z`}
        fill={fill}
      />
      {vein && (
        <path
          d={`M${L * 0.12} 0 L${L * 0.8} 0`}
          stroke={COLORS.vein}
          strokeWidth={1.3}
          strokeLinecap="round"
        />
      )}
    </g>
  );
}

function Stem({ top, bend = 0 }: { top: number; bend?: number }) {
  const mid = (BASE_Y + top) / 2;
  return (
    <path
      d={`M${BASE_X} ${BASE_Y} Q${BASE_X + bend} ${mid} ${BASE_X} ${top}`}
      stroke={COLORS.green}
      strokeWidth={2.6}
      strokeLinecap="round"
      fill="none"
    />
  );
}

function Flower({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      {[0, 60, 120, 180, 240, 300].map(a => (
        <ellipse
          key={a}
          cx={cx}
          cy={cy - 8.5}
          rx={5.2}
          ry={8.5}
          transform={`rotate(${a} ${cx} ${cy})`}
          fill={COLORS.track}
          stroke={COLORS.green}
          strokeWidth={1.3}
        />
      ))}
      <circle cx={cx} cy={cy} r={5.4} fill={COLORS.primary} />
      <circle cx={cx - 1.4} cy={cy - 1.4} r={1.8} fill={COLORS.vein} />
    </g>
  );
}

function Bud({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <path
        d={`M${cx} ${cy - 11} C${cx + 7} ${cy - 5} ${cx + 6} ${cy + 3} ${cx} ${cy + 3} C${cx - 6} ${cy + 3} ${cx - 7} ${cy - 5} ${cx} ${cy - 11}Z`}
        fill={COLORS.track}
        stroke={COLORS.green}
        strokeWidth={1.3}
      />
      <Leaf
        x={cx}
        y={cy + 3}
        angle={-125}
        length={8}
        width={3.2}
        vein={false}
      />
      <Leaf x={cx} y={cy + 3} angle={-55} length={8} width={3.2} vein={false} />
    </g>
  );
}

function Growth({ stage, wilted }: { stage: Stage; wilted: boolean }) {
  // Droop the head of a plant whose review is due.
  const head = (x: number, y: number) =>
    wilted ? `rotate(38 ${x} ${y})` : undefined;
  switch (stage) {
    case 'seed':
      return (
        <g>
          <ellipse
            cx={BASE_X}
            cy={82.5}
            rx={8.5}
            ry={6}
            transform={`rotate(-18 ${BASE_X} 82.5)`}
            fill={COLORS.card}
            stroke={COLORS.green}
            strokeWidth={1.6}
          />
          <path
            d={`M${BASE_X - 4} 81 Q${BASE_X} 78 ${BASE_X + 4} 79.5`}
            stroke={COLORS.barFill}
            strokeWidth={1.1}
            strokeLinecap="round"
            fill="none"
          />
        </g>
      );
    case 'sprout':
      return (
        <g>
          <Stem top={68} bend={3} />
          <g transform={head(BASE_X, 68)}>
            <Leaf
              x={BASE_X}
              y={68}
              angle={-155}
              length={13}
              width={6}
              fill={COLORS.barFill}
              vein={false}
            />
            <Leaf
              x={BASE_X}
              y={68}
              angle={-25}
              length={13}
              width={6}
              fill={COLORS.barFill}
              vein={false}
            />
          </g>
        </g>
      );
    case 'sapling':
      return (
        <g>
          <Stem top={50} bend={-4} />
          <Leaf x={BASE_X - 1} y={74} angle={-165} length={17} width={7} />
          <Leaf x={BASE_X - 1} y={64} angle={-15} length={17} width={7} />
          <g transform={head(BASE_X, 50)}>
            <Leaf
              x={BASE_X}
              y={51}
              angle={-140}
              length={12}
              width={5}
              fill={COLORS.barFill}
              vein={false}
            />
            <Leaf
              x={BASE_X}
              y={51}
              angle={-40}
              length={12}
              width={5}
              fill={COLORS.barFill}
              vein={false}
            />
          </g>
        </g>
      );
    case 'budding':
      return (
        <g>
          <Stem top={38} bend={4} />
          <Leaf x={BASE_X + 1} y={76} angle={-168} length={19} width={8} />
          <Leaf x={BASE_X + 1} y={66} angle={-12} length={19} width={8} />
          <Leaf x={BASE_X + 1} y={55} angle={-150} length={15} width={6.5} />
          <g transform={head(BASE_X, 38)}>
            <Bud cx={BASE_X} cy={35} />
          </g>
        </g>
      );
    case 'flowering':
      return (
        <g>
          <Stem top={36} bend={-4} />
          <Leaf x={BASE_X - 1} y={76} angle={-168} length={19} width={8} />
          <Leaf x={BASE_X - 1} y={67} angle={-12} length={19} width={8} />
          <Leaf x={BASE_X - 1} y={56} angle={-155} length={15} width={6.5} />
          <Leaf x={BASE_X - 1} y={48} angle={-28} length={13} width={5.5} />
          <g transform={head(BASE_X, 36)}>
            <Flower cx={BASE_X} cy={24} />
          </g>
        </g>
      );
  }
}

export const STAGE_WORDS: Record<Stage, string> = {
  seed: 'not tested yet',
  sprout: 'sprouting',
  sapling: 'growing',
  budding: 'budding',
  flowering: 'in flower',
};

// Highest point (in viewBox units) each stage reaches, with a little air.
export const STAGE_TOP: Record<Stage, number> = {
  seed: 64,
  sprout: 48,
  sapling: 30,
  budding: 16,
  flowering: 2,
};

export default function Plant({
  stage,
  wilted = false,
  size = 80,
  top = 0,
  label,
}: {
  stage: Stage;
  wilted?: boolean;
  /** Rendered width in px. */
  size?: number;
  /** Crop the empty sky above this viewBox y so short plants take less room. */
  top?: number;
  /** Accessible description; omit for decorative use. */
  label?: string;
}) {
  const h = 100 - top;
  return (
    <svg
      className={`plant plant--${stage}${wilted ? ' plant--wilted' : ''}`}
      viewBox={`0 ${top} 80 ${h}`}
      width={size}
      height={(size * h) / 80}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {/* Re-keyed on stage so a change of stage replays the grow-in animation. */}
      <g transform={wilted ? `rotate(14 ${BASE_X} ${BASE_Y})` : undefined}>
        <g key={stage} className="plant__body">
          <Growth stage={stage} wilted={wilted} />
        </g>
      </g>
      <ellipse cx={BASE_X} cy={91} rx={27} ry={7.5} fill={COLORS.track} />
      <path
        d="M22 89.5 Q40 86 58 89.5"
        stroke={COLORS.card}
        strokeOpacity={0.55}
        strokeWidth={1.2}
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
