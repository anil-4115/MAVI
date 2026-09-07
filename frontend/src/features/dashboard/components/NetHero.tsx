import { formatMoney } from "../../../lib/money";

interface NetHeroProps {
  name: string | null;
  netMinor: number;
  toReceiveMinor: number;
  toPayMinor: number;
  groupCount: number;
}

function toneFor(netMinor: number): "positive" | "negative" | "neutral" {
  if (netMinor > 0) return "positive";
  if (netMinor < 0) return "negative";
  return "neutral";
}

export function NetHero({
  name,
  netMinor,
  toReceiveMinor,
  toPayMinor,
  groupCount,
}: NetHeroProps) {
  const tone = toneFor(netMinor);
  const firstName = name ? name.trim().split(" ")[0] : null;
  const sentence =
    netMinor > 0
      ? "You're ahead — you're owed more than you owe."
      : netMinor < 0
        ? "You owe more than you're owed right now."
        : "You're all settled up across your groups.";
  const groupsNoun = groupCount === 1 ? "group" : "groups";

  return (
    <section className={`dash-hero dash-hero--${tone}`} aria-label="Overall net position">
      <p className="dash-hero__eyebrow">
        Welcome back{firstName ? `, ${firstName}` : ""} · Your net position
      </p>
      <p className="dash-hero__value">{formatMoney(netMinor)}</p>
      <p className="dash-hero__detail">{sentence}</p>
      <p className="dash-hero__meta">
        Expect to receive {formatMoney(toReceiveMinor)} · Expect to pay {formatMoney(toPayMinor)}
        {" · "}
        {groupCount} {groupsNoun}
      </p>
    </section>
  );
}