import { Link } from "react-router-dom";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Icon, type IconName } from "../../../components/ui/Icon";
import { formatMoney } from "../../../lib/money";

interface UpcomingPaymentsProps {
  oweMinor: number;
  owedMinor: number;
  groupCount: number;
}

/**
 * Action items built from real backend numbers only. No reminder/recurring
 * engine exists yet, so complex future items are never fabricated — when
 * there is nothing actionable, we show an honest "all settled up" state.
 */
export function UpcomingPayments({ oweMinor, owedMinor, groupCount }: UpcomingPaymentsProps) {
  const actions: {
    key: string;
    icon: IconName;
    tone: "danger" | "success";
    title: string;
    caption: string;
    amountMinor: number;
    href: string;
    cta: string;
  }[] = [];

  if (oweMinor > 0) {
    actions.push({
      key: "owe",
      icon: "trending-down",
      tone: "danger",
      title: "You owe",
      caption: `${groupCount === 0 ? "Across your groups" : `Across ${groupCount} group${groupCount === 1 ? "" : "s"}`}`,
      amountMinor: oweMinor,
      href: "/balances",
      cta: "Settle up",
    });
  }

  if (owedMinor > 0) {
    actions.push({
      key: "owed",
      icon: "trending-up",
      tone: "success",
      title: "You're owed",
      caption: "Settlements you can request",
      amountMinor: owedMinor,
      href: "/balances",
      cta: "Request payment",
    });
  }

  if (actions.length === 0) {
    return (
      <section className="card" aria-label="Action items">
        <div className="card__header">
          <h3 className="card__title">
            <span className="card__title-icon">
              <Icon name="check" size={16} />
            </span>
            Action Items
          </h3>
        </div>
        <EmptyState
          title="You're all settled up"
          description="You owe nothing across your groups. Add reminders on the Tools page to plan recurring dues."
          icon="check"
        />
      </section>
    );
  }

  return (
    <section className="card" aria-label="Action items">
      <div className="card__header">
        <h3 className="card__title">
          <span className="card__title-icon">
            <Icon name="check" size={16} />
          </span>
          Action Items
        </h3>
      </div>
      <ul className="action-list">
        {actions.map((action) => (
          <li key={action.key}>
            <Link className={`action-item action-item--${action.tone}`} to={action.href}>
              <span className="action-item__icon">
                <Icon name={action.icon} size={16} />
              </span>
              <span className="action-item__body">
                <span className="action-item__title">{action.title}</span>
                <span className="action-item__caption">{action.caption}</span>
              </span>
              <span className={`action-item__amount ${action.tone === "danger" ? "money--negative" : "money--positive"}`}>
                {formatMoney(action.amountMinor)}
              </span>
              <span className="action-item__cta">{action.cta}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}