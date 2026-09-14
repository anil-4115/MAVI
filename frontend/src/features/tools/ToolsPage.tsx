import { Link, Navigate, useParams } from "react-router-dom";
import { EmptyState } from "../../components/ui/EmptyState";
import { Icon, type IconName } from "../../components/ui/Icon";

const TOOLS: Record<string, { title: string; icon: IconName; blurb: string }> = {
  budget: {
    title: "Budget Planner",
    icon: "wallet",
    blurb: "Set monthly budgets per category and track spending against them.",
  },
  recurring: {
    title: "Recurring Expenses",
    icon: "clock",
    blurb: "Rent, subscriptions and other recurring bills — recorded once, applied monthly.",
  },
  reminders: {
    title: "Reminders",
    icon: "bell-off",
    blurb: "Get nudged when it's time to pay someone back or before a bill is due.",
  },
};

/** Honest placeholder — these tools don't have backend data yet, so no fake numbers. */
export function ToolsPage() {
  const { tool } = useParams<{ tool: string }>();
  const entry = tool ? TOOLS[tool] : undefined;

  if (!entry) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="app-page">
      <section className="card">
        <div className="card__header">
          <h3 className="card__title">
            <span className="card__title-icon">
              <Icon name={entry.icon} size={16} />
            </span>
            {entry.title}
          </h3>
        </div>
        <EmptyState
          title="Coming soon"
          description={`${entry.blurb} This tool is on the way.`}
          icon={entry.icon}
          action={
            <Link className="btn btn--secondary" to="/dashboard">
              Back to Dashboard
            </Link>
          }
        />
      </section>
    </div>
  );
}