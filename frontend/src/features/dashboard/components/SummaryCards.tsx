import type { IconName } from "../../../components/ui/Icon";
import { Icon } from "../../../components/ui/Icon";
import { formatMoney } from "../../../lib/money";

interface SummaryCardsProps {
  balanceMinor: number;
  oweMinor: number;
  owedMinor: number;
  spentThisMonthMinor: number | null;
  balanceHint?: string;
  oweHint?: string;
  owedHint?: string;
  spentHint?: string;
}

const CARDS: {
  key: string;
  label: string;
  tone: "violet" | "danger" | "success" | "amber";
  toneIcon: IconName;
  moneyClass?: "money--negative" | "money--positive";
}[] = [
  { key: "balance", label: "Total Balance", tone: "violet", toneIcon: "wallet" },
  { key: "owe", label: "You Owe", tone: "danger", toneIcon: "trending-down", moneyClass: "money--negative" },
  { key: "owed", label: "You're Owed", tone: "success", toneIcon: "trending-up", moneyClass: "money--positive" },
  { key: "spent", label: "Total Spent", tone: "amber", toneIcon: "card" },
];

export function SummaryCards({
  balanceMinor,
  oweMinor,
  owedMinor,
  spentThisMonthMinor,
  balanceHint,
  oweHint,
  owedHint,
  spentHint,
}: SummaryCardsProps) {
  const values: Record<string, number | null> = {
    balance: balanceMinor,
    owe: oweMinor,
    owed: owedMinor,
    spent: spentThisMonthMinor,
  };

  const hints: Record<string, string | undefined> = {
    balance: balanceHint,
    owe: oweHint,
    owed: owedHint,
    spent: spentHint,
  };

  return (
    <div className="summary-grid dash-summary-grid" aria-label="Financial summary">
      {CARDS.map((card) => {
        const value = values[card.key];
        return (
          <div className={`summary-card summary-card--${card.tone}`} key={card.key}>
            <div className="summary-card__head">
              <span className={`summary-card__icon summary-card__icon--${card.tone}`}>
                <Icon name={card.toneIcon} size={17} />
              </span>
              {(card.key === "owe" || card.key === "owed") && value !== null && value !== 0 && (
                <span className="summary-card__badge">
                  {card.key === "owe" ? "Pay" : "Receive"}
                </span>
              )}
            </div>
            <div className="summary-card__body">
              <p className="summary-card__label">{card.label}</p>
              <p
                className={`summary-card__value ${card.moneyClass ?? ""} ${value === null ? "money--muted" : ""}`.trim()}
                data-testid={`dash-${card.key}`}
              >
                {value === null ? "—" : formatMoney(value)}
              </p>
              {hints[card.key] && <p className="summary-card__hint">{hints[card.key]}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export type { SummaryCardsProps };