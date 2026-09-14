import { formatMoney } from "../../../lib/money";
import { shortMonthLabel } from "../api/analyticsApi";

interface SpendingBarChartProps {
  data: { month: string; totalMinor: number }[];
  currency?: string;
  highlightMonth?: string;
}

const VIEW_W = 600;
const VIEW_H = 220;
const PAD_BOTTOM = 28;
const PAD_TOP = 18;
const PAD_X = 12;

/** Compact Indian-rupee axis label: ₹25k, ₹420, ₹1.2k … */
function compactRupees(value: number): string {
  if (value < 1000) {
    return `₹${value}`;
  }
  const thousands = Math.round(value / 100) / 10;
  return `₹${thousands}k`;
}

/** Fluid horizontal bar chart of monthly totals (SVG, scales to container width). */
export function SpendingBarChart({ data, currency = "INR", highlightMonth }: SpendingBarChartProps) {
  const max = Math.max(...data.map((d) => d.totalMinor), 1);
  const grid = [3, 2, 1].map((div) => Math.round((max / 4) * div));

  const plotW = VIEW_W - PAD_X * 2;
  const plotH = VIEW_H - PAD_TOP - PAD_BOTTOM;
  const barGap = Math.max(6, plotW / data.length / 4);
  const barW = Math.max(12, (plotW - barGap * (data.length - 1)) / data.length);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width="100%"
      role="img"
      aria-label="Monthly spending bar chart"
      preserveAspectRatio="xMidYMid meet"
      style={{ maxHeight: 260 }}
    >
      {grid.map((value) => {
        const y = PAD_TOP + plotH - (value / max) * plotH;
        return (
          <g key={value}>
            <line
              x1={PAD_X}
              x2={VIEW_W - PAD_X}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.08}
              strokeDasharray="3 4"
            />
            <text
              className="chart-y-label"
              x={PAD_X - 2}
              y={y + 3}
              fontSize={10}
              fill="currentColor"
              opacity={0.6}
              textAnchor="end"
            >
              {compactRupees(value)}
            </text>
          </g>
        );
      })}

      {data.map((entry, index) => {
        const h = Math.max(2, (entry.totalMinor / max) * plotH);
        const x = PAD_X + index * (barW + barGap);
        const y = PAD_TOP + plotH - h;
        const isZero = entry.totalMinor === 0;
        return (
          <g key={entry.month} className="chart-col">
            <rect
              className={`chart-bar${entry.month === highlightMonth ? " chart-bar--current" : ""}`}
              x={x}
              y={isZero ? PAD_TOP + plotH - 3 : y}
              width={barW}
              height={isZero ? 3 : h}
              rx={Math.min(6, barW / 2)}
            >
              <title>{`${shortMonthLabel(entry.month)} — ${
                entry.totalMinor === 0 ? "No spending" : formatMoney(entry.totalMinor, currency)
              }`}</title>
            </rect>
            <text
              className="chart-x-label"
              x={x + barW / 2}
              y={VIEW_H - 8}
              fontSize={10}
              fontWeight={600}
              fill="currentColor"
              opacity={0.7}
              textAnchor="middle"
            >
              {shortMonthLabel(entry.month)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}