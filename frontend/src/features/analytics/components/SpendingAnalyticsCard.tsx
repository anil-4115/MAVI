import { Avatar } from "../../../components/ui/Avatar";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { Icon } from "../../../components/ui/Icon";
import { Skeleton } from "../../../components/ui/Skeleton";
import { formatMoney } from "../../../lib/money";
import {
  currentMonthKey,
  monthLabel,
  shiftMonth,
  type SpendingAnalytics as AnalyticsData,
} from "../api/analyticsApi";
import { CategoryDonutChart } from "./CategoryDonutChart";
import { SpendingBarChart } from "./SpendingBarChart";
import "../analytics.css";

interface SpendingAnalyticsCardProps {
  monthKey: string;
  onMonthChange: (monthKey: string) => void;
  data: AnalyticsData | null;
  error: string | null;
  loading: boolean;
  onRetry: () => void;
}

function buildMonthOptions(referenceKey: string): string[] {
  return Array.from({ length: 12 }, (_, index) => shiftMonth(referenceKey, 11 - index));
}

export function SpendingAnalyticsCard({
  monthKey,
  onMonthChange,
  data,
  error,
  loading,
  onRetry,
}: SpendingAnalyticsCardProps) {
  const options = buildMonthOptions(monthKey);
  const isCurrentMonth = monthKey === currentMonthKey();
  const canGoForward = !isCurrentMonth;

  return (
    <section className="card analytics-chart-card" aria-label="Your spending analytics">
      <div className="card__header analytics-head">
        <div className="analytics-head__title">
          <h3 className="card__title">Your Spending</h3>
          {data && <p className="analytics-head__meta">{monthLabel(data.month)}</p>}
        </div>
        <div className="month-switcher">
          <button
            type="button"
            className="icon-btn month-switcher__arrow"
            aria-label="Previous month"
            onClick={() => onMonthChange(shiftMonth(monthKey, -1))}
          >
            <Icon name="chevron-left" size={16} />
          </button>
          <div className="month-switcher__select-wrap">
            <select
              className="month-select"
              aria-label="Select month"
              value={monthKey}
              onChange={(event) => onMonthChange(event.target.value)}
            >
              {options.map((key) => (
                <option key={key} value={key}>
                  {monthLabel(key)}
                </option>
              ))}
            </select>
            {isCurrentMonth && (
              <span className="month-current">
                <span aria-hidden="true">·</span> This month
              </span>
            )}
          </div>
          <button
            type="button"
            className="icon-btn month-switcher__arrow"
            aria-label="Next month"
            disabled={!canGoForward}
            onClick={() => onMonthChange(shiftMonth(monthKey, 1))}
          >
            <Icon name="chevron-right" size={16} />
          </button>
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : loading || !data ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }} aria-hidden="true">
          <Skeleton variant="card" />
          <Skeleton variant="card" />
        </div>
      ) : data.totalSpentMinor === 0 ? (
        <EmptyState
          title={isCurrentMonth ? "No spending this month" : `No spending in ${monthLabel(data.month)}`}
          description="Add an expense to start seeing your spending analytics."
          icon="reports"
        />
      ) : (
        <>
          <div className="analytics-grid">
            <div>
              <p className="summary-card__hint" style={{ marginBottom: 8 }}>
                Total spent in {monthLabel(data.month)}
              </p>
              <p className="summary-card__value money" style={{ marginBottom: 12 }}>
                {formatMoney(data.totalSpentMinor, data.currency)}
              </p>
              <SpendingBarChart data={data.byMonth} currency={data.currency} highlightMonth={monthKey} />
            </div>
            <CategoryDonutChart
              categories={data.categories}
              totalMinor={data.totalSpentMinor}
              currency={data.currency}
            />
          </div>

          {data.topSpenders.length > 0 && (
            <>
              <hr className="divider" />
              <h4 className="section__title" style={{ fontSize: 16, marginBottom: 10 }}>
                Top spenders
              </h4>
              <ul className="top-spenders">
                {data.topSpenders.map((spender) => (
                  <li key={spender.userId} className="top-spenders__item">
                    <span className={`top-spenders__rank${spender.rank === 1 ? " top-spenders__rank--top" : ""}`}>
                      {spender.rank}
                    </span>
                    <Avatar name={spender.name} size="sm" />
                    <span className="top-spenders__body">
                      <span className="top-spenders__name">{spender.name}</span>
                      <span className="top-spenders__amount">
                        {formatMoney(spender.amountMinor, data.currency)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}