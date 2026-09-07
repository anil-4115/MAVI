interface ComingSoonTabProps {
  phase: string;
  description: string;
}

/** Structured placeholder for a group-detail section whose UI lands in a later phase. */
export function ComingSoonTab({ phase, description }: ComingSoonTabProps) {
  return (
    <div className="empty-state">
      <h3 className="empty-state__title">Coming in {phase}</h3>
      <p className="empty-state__description">{description}</p>
    </div>
  );
}