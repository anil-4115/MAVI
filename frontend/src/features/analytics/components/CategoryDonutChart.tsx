import { formatMoney } from "../../../lib/money";
import type { CategorySpend } from "../api/analyticsApi";
import { CATEGORY_COLORS, type SpendingCategory } from "../api/analyticsApi";

interface CategoryDonutChartProps {
  categories: CategorySpend[];
  totalMinor: number;
  currency?: string;
}

const RADIUS = 72;
const VIEW = 180;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Donut chart with a center total and a color-matched SVG legend. */
export function CategoryDonutChart({ categories, totalMinor, currency = "INR" }: CategoryDonutChartProps) {
  const visible = categories.filter((c) => c.amountMinor > 0);
  const total = Math.max(totalMinor, 1);

  /* Pre-compute each arc segment (dash + offset) without mutating shared state. */
  const segments = visible.reduce<
    { category: SpendingCategory; amountMinor: number; dash: number; rest: number; offset: number; cumulative: number }[]
  >((acc, entry) => {
    const fraction = entry.amountMinor / total;
    const rawDash = fraction * CIRCUMFERENCE;
    const previous = acc[acc.length - 1];
    const startFraction = previous ? previous.cumulative : 0;
    acc.push({
      category: entry.category,
      amountMinor: entry.amountMinor,
      dash: Math.max(rawDash - 3, 0.4),
      rest: CIRCUMFERENCE - rawDash + 3,
      offset: -startFraction * CIRCUMFERENCE,
      cumulative: startFraction + fraction,
    });
    return acc;
  }, []);

  return (
    <div className="donut" role="img" aria-label={`Category breakdown: total ${formatMoney(totalMinor, currency)}`}>
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} width="100%" style={{ maxWidth: 210 }}>
        <circle
          cx={VIEW / 2}
          cy={VIEW / 2}
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.08}
          strokeWidth={22}
        />
        {segments.map((segment) => (
          <circle
            key={segment.category}
            cx={VIEW / 2}
            cy={VIEW / 2}
            r={RADIUS}
            fill="none"
            stroke={CATEGORY_COLORS[segment.category]}
            strokeWidth={22}
            strokeDasharray={`${segment.dash} ${segment.rest}`}
            strokeDashoffset={segment.offset}
            strokeLinecap="round"
          >
            <title>{`${segment.category}: ${formatMoney(segment.amountMinor, currency)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="donut__center">
        <span className="donut__total">{formatMoney(totalMinor, currency)}</span>
        <span className="donut__caption">spent</span>
      </div>

      <ul className="donut__legend">
        {visible.map((entry) => {
          const percent = Math.round((entry.amountMinor / total) * 100);
          return (
            <li key={entry.category} className="donut__legend-item">
              <span
                className="donut__swatch"
                aria-hidden="true"
                style={{ backgroundColor: CATEGORY_COLORS[entry.category] }}
              />
              <span className="donut__legend-label">{entry.category}</span>
              <span className="donut__legend-value">
                {formatMoney(entry.amountMinor, currency)}
                <span className="donut__legend-percent">{percent}%</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}