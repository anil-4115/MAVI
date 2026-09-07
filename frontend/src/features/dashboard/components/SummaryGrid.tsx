import { formatMoney } from "../../../lib/money";

type ToneMode = "neutral" | "sign" | "inverse";

function toneClass(amountMinor: number, mode: ToneMode): string | undefined {
  if (mode === "neutral") return undefined;
  if (mode === "inverse") {
    return amountMinor > 0
      ? "money--negative"
      : amountMinor < 0
        ? "money--positive"
        : undefined;
  }
  return amountMinor < 0
    ? "money--negative"
    : amountMinor > 0
      ? "money--positive"
      : undefined;
}

interface SummaryCardProps {
  label: string;
  amountMinor: number;
  testId: string;
  mode: ToneMode;
}

function SummaryCard({ label, amountMinor, testId, mode }: SummaryCardProps) {
  return (
    <div className="summary-card">
      <p className="summary-card__label">{label}</p>
      <p className={`summary-card__value ${toneClass(amountMinor, mode) ?? ""}`.trim()} data-testid={testId}>
        {formatMoney(amountMinor)}
      </p>
    </div>
  );
}

interface SummaryGridProps {
  paidMinor: number;
  owedMinor: number;
  toReceiveMinor: number;
  toPayMinor: number;
  personalSpendingMinor: number;
}

export function SummaryGrid({
  paidMinor,
  owedMinor,
  toReceiveMinor,
  toPayMinor,
  personalSpendingMinor,
}: SummaryGridProps) {
  return (
    <section className="section" aria-label="Financial summary">
      <h2 className="section__title">Summary</h2>
      <div className="summary-grid">
        <SummaryCard label="You paid" amountMinor={paidMinor} testId="dash-paid" mode="neutral" />
        <SummaryCard label="You owe" amountMinor={owedMinor} testId="dash-owed" mode="inverse" />
        <SummaryCard label="To receive" amountMinor={toReceiveMinor} testId="dash-to-receive" mode="sign" />
        <SummaryCard label="To pay" amountMinor={toPayMinor} testId="dash-to-pay" mode="inverse" />
        <SummaryCard
          label="Personal spending"
          amountMinor={personalSpendingMinor}
          testId="dash-personal"
          mode="neutral"
        />
      </div>
    </section>
  );
}